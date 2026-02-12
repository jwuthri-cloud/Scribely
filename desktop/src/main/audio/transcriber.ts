import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { ModelManager } from './model-manager'

// ── Types ──────────────────────────────────────────────────
type TranscriptionProvider =
  | 'local-fast'
  | 'local-balanced'
  | 'local-accurate'
  | 'groq'
  | 'deepgram'

interface TranscriptionConfig {
  provider: TranscriptionProvider
  apiKeys: {
    groq?: string
    deepgram?: string
  }
}

export interface TranscriptionResult {
  text: string
  duration: number // seconds
}

// Provider → local model mapping
const PROVIDER_MODEL_MAP: Record<string, string> = {
  'local-fast': 'whisper-small.en',
  'local-balanced': 'whisper-medium.en',
  'local-accurate': 'whisper-large-v3-turbo',
}

// ── PCM Float32 → WAV Buffer ──────────────────────────────
function pcmToWav(pcm: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1
  const bytesPerSample = 2 // 16-bit
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = pcm.length * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bytesPerSample * 8, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    buffer.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2)
  }

  return buffer
}

// ────────────────────────────────────────────────────────────
export class Transcriber {
  private modelManager: ModelManager
  private whisper: unknown = null
  private config: TranscriptionConfig
  private tmpDir: string
  private _mode: string = 'local-fast'
  private _activeModelId: string | null = null

  constructor(modelManager: ModelManager, config: TranscriptionConfig) {
    this.modelManager = modelManager
    this.config = { ...config }
    this.tmpDir = mkdtempSync(join(tmpdir(), 'assistme-audio-'))
  }

  get mode(): string {
    return this._mode
  }

  get provider(): TranscriptionProvider {
    return this.config.provider
  }

  /** Model ID needed for current local provider (null for cloud providers) */
  get requiredModelId(): string | null {
    return PROVIDER_MODEL_MAP[this.config.provider] || null
  }

  // ── Initialization ───────────────────────────────────────
  async init(): Promise<void> {
    await this._initProvider(this.config.provider)
  }

  private async _initProvider(provider: TranscriptionProvider): Promise<void> {
    // Free existing whisper instance if switching local models
    if (this.whisper && this._activeModelId) {
      try {
        ;(this.whisper as any).free?.()
      } catch {}
      this.whisper = null
      this._activeModelId = null
    }

    const modelId = PROVIDER_MODEL_MAP[provider]

    if (modelId) {
      // Local provider — try to load whisper
      const modelPath = this.modelManager.getModelPath(modelId as any)
      if (modelPath) {
        try {
          const mod = require('smart-whisper')
          const SmartWhisper = mod.default || mod.Whisper || mod
          this.whisper = new SmartWhisper(modelPath, { gpu: true })
          this._activeModelId = modelId
          this._mode = provider
          console.log(`[transcriber] Local whisper initialized: ${modelId} (Metal)`)
        } catch (err) {
          console.warn('[transcriber] smart-whisper load failed:', err)
          this._mode = provider // keep provider, will fail gracefully on transcribe
        }
      } else {
        console.log(`[transcriber] Model ${modelId} not downloaded yet`)
        this._mode = provider
      }
    } else {
      // Cloud provider
      this._mode = provider
      console.log(`[transcriber] Using cloud provider: ${provider}`)
    }
  }

  // ── Hot-swap provider at runtime ─────────────────────────
  async setProvider(
    provider: TranscriptionProvider,
    apiKeys: TranscriptionConfig['apiKeys'],
  ): Promise<void> {
    this.config.provider = provider
    this.config.apiKeys = { ...apiKeys }
    await this._initProvider(provider)
  }

  // ── Re-init (e.g. after model download) ──────────────────
  async reinit(): Promise<void> {
    await this._initProvider(this.config.provider)
  }

  // ── Main transcription entry point ───────────────────────
  async transcribe(
    pcm: Float32Array,
    sampleRate: number = 16000,
  ): Promise<TranscriptionResult> {
    const duration = pcm.length / sampleRate

    // Silence detection
    let sumSquares = 0
    for (let i = 0; i < pcm.length; i++) {
      sumSquares += pcm[i] * pcm[i]
    }
    const rms = Math.sqrt(sumSquares / pcm.length)
    if (rms < 0.005) {
      return { text: '', duration }
    }

    const provider = this.config.provider

    // Route to correct backend
    if (provider.startsWith('local-')) {
      if (this.whisper) {
        return this._transcribeLocal(pcm, duration)
      }
      // Model not loaded yet (probably downloading)
      return { text: '', duration }
    }

    if (provider === 'groq') {
      return this._transcribeGroq(pcm, sampleRate, duration)
    }

    if (provider === 'deepgram') {
      return this._transcribeDeepgram(pcm, sampleRate, duration)
    }

    return { text: '', duration }
  }

  // ── Local whisper.cpp ────────────────────────────────────
  private async _transcribeLocal(
    pcm: Float32Array,
    duration: number,
  ): Promise<TranscriptionResult> {
    try {
      const os = require('os')
      const task = await (this.whisper as any).transcribe(pcm, {
        language: 'en',
        n_threads: Math.max(4, os.cpus().length - 2), // use most cores
        no_timestamps: true,       // skip timestamp computation
        single_segment: true,      // don't split into multiple segments
        no_context: true,          // don't use cross-chunk context (faster)
        suppress_blank: true,      // skip blank tokens
        suppress_non_speech_tokens: true,
        temperature: 0.0,          // greedy decoding (no sampling)
        max_tokens: 128,           // cap output length for short chunks
        print_progress: false,
        print_realtime: false,
        print_timestamps: false,
        print_special: false,
      })
      const segments = await task.result
      const text = Array.isArray(segments)
        ? segments.map((s: any) => s.text || '').join(' ')
        : typeof segments === 'string'
          ? segments
          : ''
      return { text: text.trim(), duration }
    } catch (err) {
      console.error('[transcriber] Local transcription failed:', err)
      return { text: '', duration }
    }
  }

  // ── Groq (OpenAI-compatible API) ─────────────────────────
  private async _transcribeGroq(
    pcm: Float32Array,
    sampleRate: number,
    duration: number,
  ): Promise<TranscriptionResult> {
    const apiKey = this.config.apiKeys.groq
    if (!apiKey) {
      return { text: '', duration }
    }

    const wav = pcmToWav(pcm, sampleRate)

    try {
      const formData = new FormData()
      const blob = new Blob([wav], { type: 'audio/wav' })
      formData.append('file', blob, 'audio.wav')
      formData.append('model', 'whisper-large-v3')
      formData.append('response_format', 'text')

      const res = await fetch(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        },
      )

      if (!res.ok) {
        const msg = await res.text()
        console.error('[transcriber] Groq API error:', msg)
        return { text: '', duration }
      }

      const text = (await res.text()).trim()
      return { text, duration }
    } catch (err) {
      console.error('[transcriber] Groq transcription failed:', err)
      return { text: '', duration }
    }
  }

  // ── Deepgram Nova-3 ──────────────────────────────────────
  private async _transcribeDeepgram(
    pcm: Float32Array,
    sampleRate: number,
    duration: number,
  ): Promise<TranscriptionResult> {
    const apiKey = this.config.apiKeys.deepgram
    if (!apiKey) {
      return { text: '', duration }
    }

    const wav = pcmToWav(pcm, sampleRate)

    try {
      const res = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'audio/wav',
          },
          body: wav,
        },
      )

      if (!res.ok) {
        const msg = await res.text()
        console.error('[transcriber] Deepgram API error:', msg)
        return { text: '', duration }
      }

      const json = await res.json()
      const text =
        json?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
      return { text: text.trim(), duration }
    } catch (err) {
      console.error('[transcriber] Deepgram transcription failed:', err)
      return { text: '', duration }
    }
  }

  // ── Cleanup ──────────────────────────────────────────────
  destroy(): void {
    if (this.whisper) {
      try {
        ;(this.whisper as any).free?.()
      } catch {}
    }
    try {
      const fs = require('fs')
      const files = fs.readdirSync(this.tmpDir)
      for (const file of files) {
        fs.unlinkSync(join(this.tmpDir, file))
      }
      fs.rmdirSync(this.tmpDir)
    } catch {}
  }
}
