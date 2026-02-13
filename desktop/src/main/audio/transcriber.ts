import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { ModelManager } from './model-manager'

// ── Types ──────────────────────────────────────────────────
type TranscriptionProvider =
  | 'local-fast'
  | 'local-balanced'
  | 'local-accurate'

interface TranscriptionConfig {
  provider: TranscriptionProvider
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

  /** Model ID needed for current local provider */
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
    }
  }

  // ── Hot-swap provider at runtime ─────────────────────────
  async setProvider(provider: TranscriptionProvider): Promise<void> {
    this.config.provider = provider
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

    if (this.whisper) {
      return this._transcribeLocal(pcm, duration)
    }

    // Model not loaded yet (probably downloading)
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
