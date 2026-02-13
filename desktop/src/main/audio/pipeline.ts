import { BrowserWindow, ipcMain, app } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, appendFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { ModelManager } from './model-manager'
import { Transcriber } from './transcriber'
import { VoiceActivityDetector, type SpeechSegment } from './vad'
import type { NativeHelperBridge } from '../native-bridge'

// ── Types ──────────────────────────────────────────────────

interface TranscriptionSettings {
  provider: string
  chunkDurationSec?: number
}

// Provider → whisper model ID mapping (matches transcriber.ts)
const PROVIDER_MODEL_MAP: Record<string, string> = {
  'local-fast': 'whisper-small.en',
  'local-balanced': 'whisper-medium.en',
  'local-accurate': 'whisper-large-v3-turbo',
}

const VAD_MODEL_ID = 'silero-vad-v5' as const
const VAD_SAMPLE_RATE = 16000
const TARGET_SAMPLE_RATE = 16000

// ── Simple linear-interpolation resampler ───────────────
function resample(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return pcm
  const ratio = fromRate / toRate
  const outLength = Math.round(pcm.length / ratio)
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio
    const lo = Math.floor(srcIdx)
    const hi = Math.min(lo + 1, pcm.length - 1)
    const frac = srcIdx - lo
    out[i] = pcm[lo] * (1 - frac) + pcm[hi] * frac
  }
  return out
}

// ── AudioPipeline ──────────────────────────────────────────

export class AudioPipeline {
  private modelManager: ModelManager
  private transcriber: Transcriber
  private window: BrowserWindow | null = null
  private isActive = false
  private sessionStartTime = 0

  // ── Per-stream VAD instances ───────────────────────────
  private micVad: VoiceActivityDetector | null = null
  private tabVad: VoiceActivityDetector | null = null
  private vadReady = false

  // ── Transcription segment queue ───────────────────────
  private segmentQueue: SpeechSegment[] = []
  private isProcessingQueue = false

  // ── Fallback buffer (when VAD is not available) ───────
  private fallbackBuffers: Map<string, { frames: Float32Array[]; samples: number }> = new Map()
  private _chunkDurationSec = 2

  // ── Transcription lock (prevent concurrent whisper calls) ──
  private _transcribeLock = false
  private _transcribeQueue: Array<{ source: string; audio: Float32Array; sampleRate: number; timestamp: number }> = []
  private static readonly MAX_QUEUE_SIZE = 4 // drop old chunks if queue backs up

  // ── Audio level metering ───────────────────────────────
  private _lastLevelSendTime = 0
  private static readonly LEVEL_SEND_INTERVAL_MS = 80
  private _micLevel = 0
  private _systemLevel = 0

  // ── Native capture bridge ─────────────────────────────
  private nativeBridge: NativeHelperBridge | null = null
  private nativeAudioHandler: ((data: {
    source: string
    pcm: Float32Array
    sampleRate: number
    timestamp: number
    numSamples: number
  }) => void) | null = null

  constructor(transcriptionSettings: TranscriptionSettings) {
    this.modelManager = new ModelManager()
    this.transcriber = new Transcriber(this.modelManager, {
      provider: transcriptionSettings.provider as any,
    })

    // Apply initial chunk duration from settings
    if (transcriptionSettings.chunkDurationSec != null) {
      this._chunkDurationSec = Math.max(1, Math.min(10, transcriptionSettings.chunkDurationSec))
    }

    // Forward model download progress to renderer
    this.modelManager.on('progress', (data) => {
      this.sendToRenderer('meeting:model-progress', data)
    })

    this.modelManager.on('complete', async (data) => {
      this.sendToRenderer('meeting:model-complete', data)

      // If whisper model completed, reinit transcriber
      if (data.modelId !== VAD_MODEL_ID) {
        await this.transcriber.reinit()
        this.sendToRenderer('meeting:status-update', {
          transcriptionMode: this.transcriber.mode,
        })
      }

      // If VAD model completed, init VAD instances
      if (data.modelId === VAD_MODEL_ID) {
        await this._initVad()
        this.sendToRenderer('meeting:status-update', {
          vadReady: this.vadReady,
        })
      }
    })
  }

  // ── Initialization ─────────────────────────────────────

  async init(): Promise<void> {
    await this.transcriber.init()
    // VAD disabled for now — use chunk-based transcription directly.
    // Uncomment the line below to re-enable VAD segmentation:
    // await this._initVad()
    this.vadReady = false
    console.log(
      `[pipeline] Initialized — transcription: ${this.transcriber.mode}, VAD: disabled (chunk-based)`,
    )
  }

  /** Initialize per-stream VAD instances if the model is available */
  private async _initVad(): Promise<void> {
    const modelPath = this.modelManager.getModelPath(VAD_MODEL_ID)
    if (!modelPath) {
      console.log('[pipeline] VAD model not downloaded yet — streaming without VAD')
      this.vadReady = false
      return
    }

    // Create per-stream VAD instances
    this.micVad = new VoiceActivityDetector('mic')
    this.tabVad = new VoiceActivityDetector('system')

    const [micOk, tabOk] = await Promise.all([
      this.micVad.init(modelPath),
      this.tabVad.init(modelPath),
    ])

    if (micOk && tabOk) {
      this.vadReady = true
      // Wire up speech-segment events → transcription queue
      this.micVad.on('speech-segment', (seg: SpeechSegment) => this._enqueueSpeech(seg))
      this.tabVad.on('speech-segment', (seg: SpeechSegment) => this._enqueueSpeech(seg))
      console.log('[pipeline] Per-stream VAD ready (mic + tab)')
    } else {
      console.warn('[pipeline] VAD init failed — falling back to chunk-based pipeline')
      this.micVad?.destroy()
      this.tabVad?.destroy()
      this.micVad = null
      this.tabVad = null
      this.vadReady = false
    }
  }

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  // ── Native Bridge Integration ─────────────────────────

  /** Connect a NativeHelperBridge to route native audio frames through the pipeline */
  setNativeBridge(bridge: NativeHelperBridge): void {
    // Detach previous bridge if any
    this._detachNativeBridge()

    this.nativeBridge = bridge

    // Listen for audio frames from the native helper
    this.nativeAudioHandler = (data) => {
      if (!this.isActive) return
      this._handleNativeAudioFrame(data.source, data.pcm, data.sampleRate, data.timestamp)
    }
    this.nativeBridge.on('audio-frame', this.nativeAudioHandler)

    console.log('[pipeline] NativeHelperBridge connected')
  }

  /** Detach the native bridge and remove listeners */
  private _detachNativeBridge(): void {
    if (this.nativeBridge && this.nativeAudioHandler) {
      this.nativeBridge.removeListener('audio-frame', this.nativeAudioHandler)
    }
    this.nativeAudioHandler = null
    this.nativeBridge = null
  }

  /** Process an audio frame from the native helper — same path as renderer frames */
  private _nativeFrameCount = 0
  private _nativeMicFrameCount = 0
  private _nativeSystemFrameCount = 0
  private _handleNativeAudioFrame(
    source: string,
    pcm: Float32Array,
    sampleRate: number,
    timestamp: number,
  ): void {
    if (pcm.length === 0) return

    // Resample to 16kHz if needed (system audio comes in at 48kHz)
    let resampled = pcm
    let effectiveRate = sampleRate
    if (sampleRate !== TARGET_SAMPLE_RATE) {
      resampled = resample(pcm, sampleRate, TARGET_SAMPLE_RATE)
      effectiveRate = TARGET_SAMPLE_RATE
    }

    this._nativeFrameCount++
    if (source === 'mic') this._nativeMicFrameCount++
    else this._nativeSystemFrameCount++

    if (this._nativeFrameCount <= 5 || this._nativeFrameCount % 50 === 0) {
      console.log(
        `[pipeline] Native frame #${this._nativeFrameCount} (mic=${this._nativeMicFrameCount}, sys=${this._nativeSystemFrameCount}): source=${source}, samples=${pcm.length}→${resampled.length}, rate=${sampleRate}→${effectiveRate}`,
      )
    }

    // Send audio levels to renderer for waveform visualization
    this._updateAudioLevel(source, resampled)

    const vad = source === 'mic' ? this.micVad : this.tabVad

    if (vad && this.vadReady) {
      vad.processChunk(resampled, effectiveRate).catch((err) => {
        console.error(`[pipeline] VAD processing error (native/${source}):`, err)
      })
    } else {
      this._handleFallbackFrame(source, resampled, effectiveRate, timestamp).catch((err) => {
        console.error(`[pipeline] Fallback transcription error (native):`, err)
      })
    }
  }

  /** Get the connected native bridge (if any) */
  getNativeBridge(): NativeHelperBridge | null {
    return this.nativeBridge
  }

  // ── External audio frame (from Chrome extension WS) ────

  /**
   * Process an externally-provided audio frame (e.g. from the Chrome extension
   * WebSocket server). Same processing path as native bridge frames.
   */
  handleExternalAudioFrame(
    source: string,
    pcm: Float32Array,
    sampleRate: number,
    timestamp: number,
  ): void {
    if (!this.isActive) return
    this._handleNativeAudioFrame(source, pcm, sampleRate, timestamp)
  }

  /** Compute RMS level from PCM and send to renderer (throttled) */
  private _updateAudioLevel(source: string, pcm: Float32Array): void {
    // Compute RMS
    let sumSq = 0
    const step = Math.max(1, Math.floor(pcm.length / 512)) // sample at most 512 points
    let count = 0
    for (let i = 0; i < pcm.length; i += step) {
      sumSq += pcm[i] * pcm[i]
      count++
    }
    const rms = Math.sqrt(sumSq / count)
    // Normalize to 0-1 range (typical speech RMS is 0.01-0.2)
    const level = Math.min(1, rms * 5)

    if (source === 'mic') {
      this._micLevel = level
    } else {
      this._systemLevel = level
    }

    // Throttle sends
    const now = Date.now()
    if (now - this._lastLevelSendTime < AudioPipeline.LEVEL_SEND_INTERVAL_MS) return
    this._lastLevelSendTime = now

    this.sendToRenderer('meeting:audio-levels', {
      mic: this._micLevel,
      system: this._systemLevel,
      timestamp: now,
    })
  }

  // ── Settings changed ───────────────────────────────────

  async onSettingsChanged(settings: TranscriptionSettings): Promise<void> {
    const provider = settings.provider as any
    console.log(`[pipeline] Transcription provider changed to: ${provider}`)

    // Update chunk duration
    if (settings.chunkDurationSec != null) {
      this._chunkDurationSec = Math.max(1, Math.min(10, settings.chunkDurationSec))
      console.log(`[pipeline] Chunk duration set to ${this._chunkDurationSec}s`)
    }

    await this.transcriber.setProvider(provider)

    // Auto-download whisper model if needed
    const modelId = PROVIDER_MODEL_MAP[provider]
    if (modelId) {
      this._autoDownloadModel(modelId)
    }

    this.sendToRenderer('meeting:status-update', {
      transcriptionMode: this.transcriber.mode,
    })
  }

  /** Auto-download a model if not present */
  private _autoDownloadModel(modelId: string): void {
    if (
      !this.modelManager.isModelAvailable(modelId as any) &&
      !this.modelManager.isDownloading(modelId as any)
    ) {
      console.log(`[pipeline] Model ${modelId} not found — starting auto-download`)
      this.sendToRenderer('meeting:status-update', {
        transcriptionMode: modelId === VAD_MODEL_ID ? this.transcriber.mode : 'downloading',
      })
      this.modelManager
        .downloadModel(modelId as any)
        .then(async () => {
          if (modelId !== VAD_MODEL_ID) {
            await this.transcriber.reinit()
          }
          console.log(`[pipeline] Model ${modelId} ready`)
        })
        .catch((err) => {
          console.error(`[pipeline] Auto-download of ${modelId} failed:`, err)
        })
    }
  }

  // ── Speech Segment Queue ───────────────────────────────

  /** Add a VAD-detected speech segment to the transcription queue */
  private _enqueueSpeech(segment: SpeechSegment): void {
    if (!this.isActive) return
    this.segmentQueue.push(segment)
    this._drainQueue()
  }

  /** Process the transcription queue sequentially */
  private async _drainQueue(): Promise<void> {
    if (this.isProcessingQueue) return
    this.isProcessingQueue = true

    while (this.segmentQueue.length > 0) {
      const segment = this.segmentQueue.shift()!
      await this._transcribeSegment(segment)
    }

    this.isProcessingQueue = false
  }

  /** Transcribe a single speech segment and emit the result */
  private async _transcribeSegment(segment: SpeechSegment): Promise<void> {
    try {
      const result = await this.transcriber.transcribe(segment.audio, VAD_SAMPLE_RATE)
      if (!result.text) return

      const entry = {
        id: randomUUID(),
        speaker: segment.source === 'mic' ? 'You' : 'Them',
        text: result.text,
        startTime: segment.startTime,
        endTime: segment.endTime,
        confidence: 1.0,
        source: segment.source,
        isEdited: false,
      }

      this.sendToRenderer('meeting:transcript-entry', entry)
    } catch (err) {
      console.error('[pipeline] Transcription of speech segment failed:', err)
    }
  }

  // ── Fallback: chunk-based pipeline (no VAD) ────────────

  /**
   * When VAD is not available, accumulate frames into 2-second chunks
   * and transcribe them directly. Mic chunks get priority in the queue.
   */
  private async _handleFallbackFrame(
    source: string,
    pcm: Float32Array,
    sampleRate: number,
    timestamp: number,
  ): Promise<void> {
    if (!this.fallbackBuffers.has(source)) {
      this.fallbackBuffers.set(source, { frames: [], samples: 0 })
    }
    const buf = this.fallbackBuffers.get(source)!
    buf.frames.push(pcm)
    buf.samples += pcm.length

    const chunkSamples = sampleRate * this._chunkDurationSec
    if (buf.samples >= chunkSamples) {
      // Flush buffer
      const combined = new Float32Array(buf.samples)
      let offset = 0
      for (const frame of buf.frames) {
        combined.set(frame, offset)
        offset += frame.length
      }
      buf.frames = []
      buf.samples = 0

      // Skip very short chunks
      if (combined.length < sampleRate * 0.3) return

      // Queue for serialized transcription (prevents concurrent whisper calls)
      // Mic chunks get priority — insert at front of queue
      if (source === 'mic') {
        this._transcribeQueue.unshift({ source, audio: combined, sampleRate, timestamp })
      } else {
        this._transcribeQueue.push({ source, audio: combined, sampleRate, timestamp })
      }

      // Drop oldest system chunks if queue is backing up (keep mic chunks)
      while (this._transcribeQueue.length > AudioPipeline.MAX_QUEUE_SIZE) {
        const dropIdx = this._transcribeQueue.findIndex((item, i) => i > 0 && item.source === 'system')
        if (dropIdx >= 0) {
          console.log(`[pipeline] Dropping stale system chunk (queue=${this._transcribeQueue.length})`)
          this._transcribeQueue.splice(dropIdx, 1)
        } else {
          break
        }
      }

      this._drainTranscribeQueue()
    }
  }

  /** Serialize whisper transcriptions — only one at a time to avoid Metal conflicts */
  private async _drainTranscribeQueue(): Promise<void> {
    if (this._transcribeLock) return
    this._transcribeLock = true

    while (this._transcribeQueue.length > 0) {
      const item = this._transcribeQueue.shift()!
      if (!this.isActive) continue

      try {
        const t0 = Date.now()
        const result = await this.transcriber.transcribe(item.audio, item.sampleRate)
        const elapsed = Date.now() - t0

        if (result.text) {
          const entry = {
            id: randomUUID(),
            speaker: item.source === 'mic' ? 'You' : 'Them',
            text: result.text,
            startTime: this.isActive ? item.timestamp - this.sessionStartTime : 0,
            endTime: this.isActive
              ? item.timestamp - this.sessionStartTime + result.duration * 1000
              : result.duration * 1000,
            confidence: 1.0,
            source: item.source,
            isEdited: false,
          }

          console.log(`[pipeline] → ${entry.speaker} (${elapsed}ms, q=${this._transcribeQueue.length}): "${entry.text}"`)

          if (this.isActive) {
            this.sendToRenderer('meeting:transcript-entry', entry)
          }
        } else {
          console.log(`[pipeline] ${item.source} chunk: silence (${elapsed}ms)`)
        }
      } catch (err) {
        console.error(`[pipeline] Transcription error (${item.source}):`, err)
      }
    }

    this._transcribeLock = false
  }

  /** Flush remaining fallback buffers */
  private async _flushFallbackBuffers(): Promise<void> {
    for (const [source, buf] of this.fallbackBuffers.entries()) {
      if (buf.samples > 0) {
        const combined = new Float32Array(buf.samples)
        let offset = 0
        for (const frame of buf.frames) {
          combined.set(frame, offset)
          offset += frame.length
        }
        buf.frames = []
        buf.samples = 0

        if (combined.length < 16000 * 0.3) continue

        this._transcribeQueue.push({ source, audio: combined, sampleRate: 16000, timestamp: Date.now() })
      }
    }
    await this._drainTranscribeQueue()
  }

  // ── IPC Handlers ───────────────────────────────────────

  registerIpcHandlers(): void {
    // ── Start meeting session ────────────────────────────
    ipcMain.handle('meeting:start-session', async () => {
      // Auto-download whisper model if needed
      const whisperModelId = this.transcriber.requiredModelId
      if (whisperModelId) {
        this._autoDownloadModel(whisperModelId)
      }

      // VAD disabled — skip auto-download
      // this._autoDownloadModel(VAD_MODEL_ID)

      this.isActive = true
      this.sessionStartTime = Date.now()
      this.segmentQueue = []
      this.isProcessingQueue = false
      this.fallbackBuffers.clear()
      this._transcribeQueue = []

      // Reset VAD state for fresh session
      this.micVad?.flush()
      this.tabVad?.flush()

      console.log(
        `[pipeline] Meeting session started (VAD: ${this.vadReady ? 'enabled' : 'fallback-chunk'})`,
      )

      return {
        sessionId: randomUUID(),
        transcriptionMode: this.transcriber.mode,
        vadEnabled: this.vadReady,
      }
    })

    // ── Stop meeting session ─────────────────────────────
    ipcMain.handle('meeting:stop-session', async () => {
      // Flush any remaining VAD speech
      this.micVad?.flush()
      this.tabVad?.flush()

      // Drain any remaining transcription queue
      await this._drainQueue()

      // Flush fallback buffers
      await this._flushFallbackBuffers()

      this.isActive = false
      this.segmentQueue = []
      this.fallbackBuffers.clear()
      this._transcribeQueue = []

      console.log('[pipeline] Meeting session stopped')
      return { success: true }
    })

    // ── Stream audio frame (fire-and-forget from renderer) ─
    // This is the Phase 2 streaming path: renderer sends small
    // audio frames (~256ms), main process runs VAD + segmentation.
    ipcMain.on(
      'meeting:audio-frame',
      (
        _event,
        payload: {
          source: string
          pcm: ArrayBuffer
          sampleRate: number
          timestamp: number
        },
      ) => {
        if (!this.isActive) return

        const pcm = new Float32Array(payload.pcm)
        if (pcm.length === 0) return

        // Send audio levels to renderer for waveform visualization
        this._updateAudioLevel(payload.source, pcm)

        // Energy gate for mic: drop near-silent frames before they reach
        // VAD/Whisper.  Without this, ambient noise triggers hallucinations
        // like "Thank you. Bye."  (Gate moved here from the renderer so
        // the WAV recorder still gets continuous audio for sync.)
        if (payload.source === 'mic') {
          let sumSq = 0
          for (let i = 0; i < pcm.length; i++) sumSq += pcm[i] * pcm[i]
          const rms = Math.sqrt(sumSq / pcm.length)
          if (rms < 0.005) return // ~-46 dBFS
        }

        const vad = payload.source === 'mic' ? this.micVad : this.tabVad

        if (vad && this.vadReady) {
          // VAD-gated path: feed to per-stream VAD
          vad.processChunk(pcm, payload.sampleRate).catch((err) => {
            console.error(`[pipeline] VAD processing error (${payload.source}):`, err)
          })
        } else {
          // Fallback: accumulate into 3-second chunks and transcribe directly
          this._handleFallbackFrame(
            payload.source,
            pcm,
            payload.sampleRate,
            payload.timestamp,
          ).catch((err) => {
            console.error(`[pipeline] Fallback transcription error:`, err)
          })
        }
      },
    )

    // ── Legacy: transcribe audio chunk (kept for backward compat) ─
    ipcMain.handle(
      'meeting:transcribe-chunk',
      async (
        _event,
        payload: {
          source: string
          pcm: ArrayBuffer
          sampleRate: number
          timestamp: number
        },
      ) => {
        // Auto-download model on first use
        const modelId = this.transcriber.requiredModelId
        if (modelId) {
          this._autoDownloadModel(modelId)
        }

        const pcm = new Float32Array(payload.pcm)
        if (pcm.length < payload.sampleRate * 0.3) return null

        const result = await this.transcriber.transcribe(pcm, payload.sampleRate)

        if (result.text) {
          const entry = {
            id: randomUUID(),
            speaker: payload.source === 'mic' ? 'You' : 'Them',
            text: result.text,
            startTime: this.isActive ? payload.timestamp - this.sessionStartTime : 0,
            endTime: this.isActive
              ? payload.timestamp - this.sessionStartTime + result.duration * 1000
              : result.duration * 1000,
            confidence: 1.0,
            source: payload.source,
            isEdited: false,
          }

          if (this.isActive) {
            this.sendToRenderer('meeting:transcript-entry', entry)
          }
          return entry
        }

        return null
      },
    )

    // ── Model status ─────────────────────────────────────
    ipcMain.handle('meeting:get-model-status', () => {
      const whisperModelId = this.transcriber.requiredModelId
      return {
        whisperModel: {
          available: whisperModelId
            ? this.modelManager.isModelAvailable(whisperModelId as any)
            : true,
          downloading: whisperModelId
            ? this.modelManager.isDownloading(whisperModelId as any)
            : false,
          progress: whisperModelId
            ? this.modelManager.getDownloadProgress(whisperModelId as any)
            : 0,
          path: whisperModelId ? this.modelManager.getModelPath(whisperModelId as any) : null,
          modelId: whisperModelId || null,
        },
        vadModel: {
          available: this.modelManager.isModelAvailable(VAD_MODEL_ID),
          downloading: this.modelManager.isDownloading(VAD_MODEL_ID),
          progress: this.modelManager.getDownloadProgress(VAD_MODEL_ID),
          ready: this.vadReady,
        },
      }
    })

    // ── Download whisper model ────────────────────────────
    ipcMain.handle('meeting:download-model', async () => {
      const modelId = this.transcriber.requiredModelId
      if (!modelId) {
        return { success: true, mode: this.transcriber.mode }
      }
      try {
        const path = await this.modelManager.downloadModel(modelId as any)
        await this.transcriber.reinit()
        return { success: true, path, mode: this.transcriber.mode }
      } catch (err) {
        console.error('[pipeline] Model download failed:', err)
        return { success: false, error: String(err) }
      }
    })

    // ── Native capture: start ──────────────────────────
    ipcMain.handle(
      'meeting:start-native-capture',
      async (
        _event,
        options: { mic: boolean; system: boolean },
      ) => {
        console.log('[pipeline] start-native-capture called:', JSON.stringify(options))
        console.log('[pipeline] nativeBridge exists:', !!this.nativeBridge)
        console.log('[pipeline] nativeBridge status:', this.nativeBridge ? JSON.stringify(this.nativeBridge.status) : 'N/A')

        if (!this.nativeBridge) {
          return { success: false, error: 'Native helper not connected' }
        }
        if (!this.nativeBridge.status.connected) {
          return { success: false, error: 'Native helper not connected (socket down)' }
        }
        try {
          this._nativeFrameCount = 0
          await this.nativeBridge.startCapture({
            mic: options.mic,
            system: options.system,
          })
          console.log('[pipeline] Native capture command sent successfully')
          return { success: true }
        } catch (err) {
          console.error('[pipeline] Native capture start failed:', err)
          return { success: false, error: String(err) }
        }
      },
    )

    // ── Native capture: stop ───────────────────────────
    ipcMain.handle('meeting:stop-native-capture', async () => {
      if (!this.nativeBridge) {
        return { success: false, error: 'Native helper not connected' }
      }
      try {
        await this.nativeBridge.stopCapture()
        return { success: true }
      } catch (err) {
        console.error('[pipeline] Native capture stop failed:', err)
        return { success: false, error: String(err) }
      }
    })

    // ── Native capture: get status ─────────────────────
    ipcMain.handle('meeting:get-native-status', () => {
      const status = !this.nativeBridge
        ? {
            available: false,
            connected: false,
            processRunning: false,
            captureState: 'idle',
            micActive: false,
            systemAudioActive: false,
          }
        : {
            available: true,
            ...this.nativeBridge.status,
          }
      console.log('[pipeline] get-native-status:', JSON.stringify(status))
      return status
    })

    // ── Save meeting recording to disk ───────────────────
    ipcMain.handle(
      'meeting:save-recording',
      async (
        _event,
        payload: {
          data: ArrayBuffer
          mimeType: string
        },
      ) => {
        const dir = join(app.getPath('documents'), 'AssistMe', 'recordings')
        await mkdir(dir, { recursive: true })

        const ext = payload.mimeType.includes('webm') ? 'webm' : 'mp4'
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19)
        const filename = `meeting-${timestamp}.${ext}`
        const filepath = join(dir, filename)

        await writeFile(filepath, Buffer.from(payload.data))
        console.log(`[pipeline] Recording saved: ${filepath}`)
        return { filepath, filename }
      },
    )

    // ── Incremental recording: create file and return path ──
    ipcMain.handle(
      'meeting:init-recording-file',
      async (
        _event,
        payload: { mimeType: string },
      ) => {
        const dir = join(app.getPath('documents'), 'AssistMe', 'recordings')
        await mkdir(dir, { recursive: true })

        const ext = payload.mimeType.includes('webm') ? 'webm' : 'mp4'
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19)
        const filename = `meeting-${timestamp}.${ext}`
        const filepath = join(dir, filename)

        // Create empty file
        await writeFile(filepath, Buffer.alloc(0))
        console.log(`[pipeline] Recording file initialized: ${filepath}`)
        return { filepath, filename }
      },
    )

    // ── Incremental recording: append chunk to file ─────────
    ipcMain.handle(
      'meeting:append-recording-chunk',
      async (
        _event,
        payload: { filepath: string; data: ArrayBuffer },
      ) => {
        const size = payload.data.byteLength
        await appendFile(payload.filepath, Buffer.from(payload.data))
        console.log(`[pipeline] Recording chunk appended: ${(size / 1024).toFixed(1)}KB → ${payload.filepath.split('/').pop()}`)
      },
    )

    // ── Save transcript JSON to disk ────────────────────────
    ipcMain.handle(
      'meeting:save-transcript',
      async (
        _event,
        payload: {
          entries: Array<{
            id: string
            speaker: string
            text: string
            startTime: number
            endTime: number
            source: string
          }>
          sessionId?: string
          recordingFilepath?: string
        },
      ) => {
        const dir = join(app.getPath('documents'), 'AssistMe', 'recordings')
        await mkdir(dir, { recursive: true })

        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19)
        const filename = `transcript-${timestamp}.json`
        const filepath = join(dir, filename)

        const data = {
          version: 1,
          createdAt: new Date().toISOString(),
          sessionId: payload.sessionId,
          recordingFilepath: payload.recordingFilepath,
          entries: payload.entries,
          summary: {
            totalEntries: payload.entries.length,
            speakers: [...new Set(payload.entries.map((e) => e.speaker))],
            durationMs: payload.entries.length > 0
              ? Math.max(...payload.entries.map((e) => e.endTime))
              : 0,
          },
        }

        await writeFile(filepath, JSON.stringify(data, null, 2))
        console.log(`[pipeline] Transcript saved: ${filepath} (${payload.entries.length} entries)`)
        return { filepath, filename }
      },
    )
  }

  // ── Helpers ────────────────────────────────────────────

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  destroy(): void {
    this._detachNativeBridge()
    this.micVad?.destroy()
    this.tabVad?.destroy()
    this.transcriber.destroy()
    this.segmentQueue = []
    this.fallbackBuffers.clear()
  }
}
