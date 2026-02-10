import { BrowserWindow, ipcMain, app } from 'electron'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { ModelManager } from './model-manager'
import { Transcriber } from './transcriber'
import { VoiceActivityDetector, type SpeechSegment } from './vad'

// ── Types ──────────────────────────────────────────────────

interface TranscriptionSettings {
  provider: string
  apiKeys: {
    groq?: string
    deepgram?: string
  }
}

// Provider → whisper model ID mapping (matches transcriber.ts)
const PROVIDER_MODEL_MAP: Record<string, string> = {
  'local-fast': 'whisper-small.en',
  'local-balanced': 'whisper-medium.en',
  'local-accurate': 'whisper-large-v3-turbo',
}

const VAD_MODEL_ID = 'silero-vad-v5' as const
const VAD_SAMPLE_RATE = 16000

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
  private static readonly FALLBACK_CHUNK_SECONDS = 3

  constructor(transcriptionSettings: TranscriptionSettings) {
    this.modelManager = new ModelManager()
    this.transcriber = new Transcriber(this.modelManager, {
      provider: transcriptionSettings.provider as any,
      apiKeys: transcriptionSettings.apiKeys,
    })

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
    await this._initVad()
    console.log(
      `[pipeline] Initialized — transcription: ${this.transcriber.mode}, VAD: ${this.vadReady ? 'ready' : 'unavailable'}`,
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

  // ── Settings changed ───────────────────────────────────

  async onSettingsChanged(settings: TranscriptionSettings): Promise<void> {
    const provider = settings.provider as any
    console.log(`[pipeline] Transcription provider changed to: ${provider}`)

    await this.transcriber.setProvider(provider, settings.apiKeys)

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
   * When VAD is not available, accumulate frames into 3-second chunks
   * and transcribe them directly (Phase 1 behavior).
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

    const chunkSamples = sampleRate * AudioPipeline.FALLBACK_CHUNK_SECONDS
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

      const result = await this.transcriber.transcribe(combined, sampleRate)
      if (result.text) {
        const entry = {
          id: randomUUID(),
          speaker: source === 'mic' ? 'You' : 'Them',
          text: result.text,
          startTime: this.isActive ? timestamp - this.sessionStartTime : 0,
          endTime: this.isActive
            ? timestamp - this.sessionStartTime + result.duration * 1000
            : result.duration * 1000,
          confidence: 1.0,
          source,
          isEdited: false,
        }

        if (this.isActive) {
          this.sendToRenderer('meeting:transcript-entry', entry)
        }
      }
    }
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

        const result = await this.transcriber.transcribe(combined, 16000)
        if (result.text && this.isActive) {
          const entry = {
            id: randomUUID(),
            speaker: source === 'mic' ? 'You' : 'Them',
            text: result.text,
            startTime: 0,
            endTime: result.duration * 1000,
            confidence: 1.0,
            source,
            isEdited: false,
          }
          this.sendToRenderer('meeting:transcript-entry', entry)
        }
      }
    }
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

      // Auto-download VAD model if needed
      this._autoDownloadModel(VAD_MODEL_ID)

      this.isActive = true
      this.sessionStartTime = Date.now()
      this.segmentQueue = []
      this.isProcessingQueue = false
      this.fallbackBuffers.clear()

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
  }

  // ── Helpers ────────────────────────────────────────────

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  destroy(): void {
    this.micVad?.destroy()
    this.tabVad?.destroy()
    this.transcriber.destroy()
    this.segmentQueue = []
    this.fallbackBuffers.clear()
  }
}
