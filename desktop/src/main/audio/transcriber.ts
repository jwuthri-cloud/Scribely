import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createClient } from '@deepgram/sdk'
import { createLogger } from '../logger'
import { ModelManager } from './model-manager'

const log = createLogger('transcriber')

// ── Types ──────────────────────────────────────────────────
type TranscriptionProvider =
  | 'local-fast'
  | 'local-balanced'
  | 'local-accurate'
  | 'deepgram'
  | 'assemblyai'
  | 'gladia'
  | 'revai'

type TranscriptionLanguage = 'en' | 'multi'

interface TranscriptionConfig {
  provider: TranscriptionProvider
  language?: TranscriptionLanguage
  cloudModel?: string
  apiKeys?: {
    deepgram?: string
    assemblyai?: string
    gladia?: string
    revai?: string
  }
}

export interface TranscriptionResult {
  text: string
  duration: number // seconds
}

// (localModel, language) → whisper model ID. null = cloud.
function getLocalModelId(
  provider: TranscriptionProvider,
  language: TranscriptionLanguage = 'en',
): string | null {
  if (provider === 'local-fast') {
    return language === 'en' ? 'whisper-small.en' : 'whisper-small'
  }
  if (provider === 'local-balanced') {
    return language === 'en' ? 'whisper-medium.en' : 'whisper-medium'
  }
  if (provider === 'local-accurate') {
    return 'whisper-large-v3-turbo' // same for en/multi
  }
  return null
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
    this.tmpDir = mkdtempSync(join(tmpdir(), 'scribely-audio-'))
  }

  get mode(): string {
    return this._mode
  }

  get provider(): TranscriptionProvider {
    return this.config.provider
  }

  /** Model ID needed for current local provider (null for cloud providers) */
  get requiredModelId(): string | null {
    return getLocalModelId(
      this.config.provider,
      this.config.language ?? 'en',
    )
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

    const modelId = getLocalModelId(provider, this.config.language ?? 'en')

    if (provider === 'deepgram' || provider === 'assemblyai' || provider === 'gladia' || provider === 'revai') {
      this._mode = provider
      log.info(`${provider} cloud provider selected`)
      return
    }

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
          log.success(`Local whisper initialized: ${modelId} (Metal)`)
        } catch (err) {
          log.warn('smart-whisper load failed:', err)
          this._mode = provider // keep provider, will fail gracefully on transcribe
        }
      } else {
        log.info(`Model ${modelId} not downloaded yet`)
        this._mode = provider
      }
    }
  }

  // ── Hot-swap provider at runtime ─────────────────────────
  async setConfig(config: TranscriptionConfig): Promise<void> {
    this.config = { ...config }
    await this._initProvider(this.config.provider)
  }

  // ── Re-init (e.g. after model download) ──────────────────
  async reinit(): Promise<void> {
    await this._initProvider(this.config.provider)
  }

  /** Unload Whisper from memory (e.g. when meeting stops). Call reinit() to load again. */
  unload(): void {
    if (this.whisper && this._activeModelId) {
      try {
        ;(this.whisper as any).free?.()
        log.info(`Unloaded Whisper model: ${this._activeModelId}`)
      } catch {}
      this.whisper = null
      this._activeModelId = null
    }
  }

  /** Whether the Whisper model is currently loaded in memory */
  get isLoaded(): boolean {
    return this.whisper != null
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

    if (this.config.provider === 'deepgram') {
      return this._transcribeDeepgram(pcm, duration)
    }
    if (this.config.provider === 'assemblyai' || this.config.provider === 'gladia' || this.config.provider === 'revai') {
      return { text: '', duration } // Not implemented yet
    }

    if (this.whisper) {
      return this._transcribeLocal(pcm, duration)
    }

    // Model not loaded yet (probably downloading)
    return { text: '', duration }
  }

  // ── Deepgram (cloud) ─────────────────────────────────────
  private async _transcribeDeepgram(
    pcm: Float32Array,
    duration: number,
  ): Promise<TranscriptionResult> {
    const apiKey = this.config.apiKeys?.deepgram?.trim()
    if (!apiKey) {
      return { text: '', duration }
    }

    const model = (this.config.cloudModel?.trim() || 'nova-3') as string
    const language = this.config.language === 'multi' ? 'multi' : 'en'

    try {
      // Convert Float32 PCM (-1..1) to Int16 linear16
      const int16 = new Int16Array(pcm.length)
      for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]))
        int16[i] = s < 0 ? s * 32768 : s * 32767
      }
      const buffer = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength)

      const deepgram = createClient(apiKey)
      const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
        buffer,
        {
          model,
          language,
          encoding: 'linear16',
          sample_rate: 16000,
        },
      )

      if (error) {
        log.error('Deepgram API error:', error)
        return { text: '', duration }
      }

      const transcript =
        result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
      return { text: transcript.trim(), duration }
    } catch (err) {
      log.error('Deepgram transcription failed:', err)
      return { text: '', duration }
    }
  }

  // ── Local whisper.cpp ────────────────────────────────────
  private async _transcribeLocal(
    pcm: Float32Array,
    duration: number,
  ): Promise<TranscriptionResult> {
    try {
      const os = require('os')
      const lang = this.config.language === 'multi' ? '' : 'en'
      const task = await (this.whisper as any).transcribe(pcm, {
        language: lang || undefined,
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
      log.error('Local transcription failed:', err)
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
