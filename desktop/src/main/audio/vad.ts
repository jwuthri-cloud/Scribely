import { EventEmitter } from 'events'
import { createLogger } from '../logger'

// ── Constants ──────────────────────────────────────────────
// Silero ONNX (see snakers4/silero-vad OnnxWrapper): for 16 kHz, each step uses
// 512 samples of new audio with 64 samples of trailing context from the previous
// window — input tensor shape is [1, 576], not [1, 512].
const VAD_FRAME_SIZE = 512
const CONTEXT_SIZE = 64
const MODEL_INPUT_SIZE = CONTEXT_SIZE + VAD_FRAME_SIZE // 576
const VAD_SAMPLE_RATE = 16000
const FRAME_DURATION_MS = (VAD_FRAME_SIZE / VAD_SAMPLE_RATE) * 1000 // 32ms

// LSTM state: [2, 1, 128] float32 (matches upstream silero_vad.onnx)
const STATE_DIM = 128

// Hysteresis thresholds
const START_THRESHOLD = 0.5
const END_THRESHOLD = 0.35

// Timing constraints (in frames)
const MIN_SPEECH_FRAMES = Math.ceil(250 / FRAME_DURATION_MS) // ~8 frames ≈ 256ms
const MIN_SILENCE_FRAMES = Math.ceil(100 / FRAME_DURATION_MS) // ~4 frames ≈ 128ms
const PRE_SPEECH_PADDING_FRAMES = Math.ceil(100 / FRAME_DURATION_MS) // ~3 frames ≈ 96ms
const MIN_CONFIRM_FRAMES = 2 // require 2 consecutive frames to confirm speech start

// ── Types ──────────────────────────────────────────────────

export interface SpeechSegment {
  /** Concatenated PCM audio of the speech segment at 16kHz */
  audio: Float32Array
  /** Start time in ms from session start */
  startTime: number
  /** End time in ms from session start */
  endTime: number
  /** Audio source label ('mic' | 'system') */
  source: string
}

// ── Resampler (linear interpolation) ───────────────────────

function resample(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return pcm
  const ratio = fromRate / toRate
  const outputLength = Math.round(pcm.length / ratio)
  const output = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio
    const srcFloor = Math.floor(srcIndex)
    const srcCeil = Math.min(srcFloor + 1, pcm.length - 1)
    const frac = srcIndex - srcFloor
    output[i] = pcm[srcFloor] * (1 - frac) + pcm[srcCeil] * frac
  }
  return output
}

// ── VoiceActivityDetector ──────────────────────────────────

export class VoiceActivityDetector extends EventEmitter {
  private ort: any = null
  private session: any = null

  /** Rolling context — last 64 samples fed into the next ONNX window */
  private context: Float32Array = new Float32Array(CONTEXT_SIZE)
  /** Reused buffer: [context | 512 new samples] → shape [1, 576] */
  private modelInput: Float32Array = new Float32Array(MODEL_INPUT_SIZE)

  private state: any = null // [2, 1, 128]
  private srTensor: any = null // [1] int64

  private isSpeaking = false
  private speechStartFrame = 0
  private frameCount = 0
  private speechFrames: Float32Array[] = []
  private preSpeechBuffer: Float32Array[] = []
  private consecutiveSpeechFrames = 0
  private consecutiveSilenceFrames = 0

  private leftover: Float32Array | null = null

  private source: string

  constructor(source: string) {
    super()
    this.source = source
  }

  get isReady(): boolean {
    return this.session !== null
  }

  async init(modelPath: string): Promise<boolean> {
    try {
      this.ort = require('onnxruntime-node')
      this.session = await this.ort!.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
      })
      this._resetState()
      createLogger('vad').success(`[${this.source}] Silero VAD initialized (${modelPath})`)
      return true
    } catch (err) {
      createLogger('vad').warn(`[${this.source}] Init failed — VAD disabled:`, err)
      this.session = null
      return false
    }
  }

  private _resetState(): void {
    if (!this.ort) return
    this.state = new this.ort.Tensor(
      'float32',
      new Float32Array(2 * 1 * STATE_DIM),
      [2, 1, STATE_DIM],
    )
    this.srTensor = new this.ort.Tensor(
      'int64',
      BigInt64Array.from([BigInt(VAD_SAMPLE_RATE)]),
      [1],
    )
    this.context.fill(0)
    this.isSpeaking = false
    this.speechFrames = []
    this.preSpeechBuffer = []
    this.consecutiveSpeechFrames = 0
    this.consecutiveSilenceFrames = 0
    this.speechStartFrame = 0
    this.frameCount = 0
    this.leftover = null
  }

  async processChunk(pcm: Float32Array, sampleRate: number): Promise<void> {
    if (!this.session) return

    let audio = sampleRate !== VAD_SAMPLE_RATE ? resample(pcm, sampleRate, VAD_SAMPLE_RATE) : pcm

    if (this.leftover) {
      const merged = new Float32Array(this.leftover.length + audio.length)
      merged.set(this.leftover)
      merged.set(audio, this.leftover.length)
      audio = merged
      this.leftover = null
    }

    let offset = 0
    while (offset + VAD_FRAME_SIZE <= audio.length) {
      const frame = audio.subarray(offset, offset + VAD_FRAME_SIZE)
      await this._processFrame(frame)
      offset += VAD_FRAME_SIZE
    }

    if (offset < audio.length) {
      this.leftover = new Float32Array(audio.subarray(offset))
    }
  }

  private async _processFrame(frame: Float32Array): Promise<void> {
    const probability = await this._infer(frame)
    if (probability < 0) return

    this.frameCount++

    if (!this.isSpeaking) {
      this._handleNonSpeech(frame, probability)
    } else {
      this._handleSpeech(frame, probability)
    }
  }

  private _handleNonSpeech(frame: Float32Array, probability: number): void {
    this.preSpeechBuffer.push(new Float32Array(frame))
    while (this.preSpeechBuffer.length > PRE_SPEECH_PADDING_FRAMES) {
      this.preSpeechBuffer.shift()
    }

    if (probability >= START_THRESHOLD) {
      this.consecutiveSpeechFrames++
      if (this.consecutiveSpeechFrames >= MIN_CONFIRM_FRAMES) {
        this.isSpeaking = true
        this.speechStartFrame = this.frameCount - this.preSpeechBuffer.length
        if (this.speechStartFrame < 0) this.speechStartFrame = 0

        this.speechFrames = [...this.preSpeechBuffer]
        this.preSpeechBuffer = []
        this.consecutiveSilenceFrames = 0

        this.emit('speech-start', {
          time: Math.max(0, this.speechStartFrame * FRAME_DURATION_MS),
          source: this.source,
        })
      }
    } else {
      this.consecutiveSpeechFrames = 0
    }
  }

  private _handleSpeech(frame: Float32Array, probability: number): void {
    this.speechFrames.push(new Float32Array(frame))

    if (probability < END_THRESHOLD) {
      this.consecutiveSilenceFrames++
      if (this.consecutiveSilenceFrames >= MIN_SILENCE_FRAMES) {
        this._emitSegment()
        this.isSpeaking = false
        this.speechFrames = []
        this.preSpeechBuffer = []
        this.consecutiveSpeechFrames = 0
        this.consecutiveSilenceFrames = 0
      }
    } else {
      this.consecutiveSilenceFrames = 0
    }
  }

  private _emitSegment(): void {
    const numFrames = this.speechFrames.length
    const speechDurationMs = numFrames * FRAME_DURATION_MS

    if (speechDurationMs < MIN_SPEECH_FRAMES * FRAME_DURATION_MS) {
      return
    }

    const totalSamples = numFrames * VAD_FRAME_SIZE
    const audio = new Float32Array(totalSamples)
    for (let i = 0; i < numFrames; i++) {
      audio.set(this.speechFrames[i], i * VAD_FRAME_SIZE)
    }

    const startTime = Math.max(0, this.speechStartFrame * FRAME_DURATION_MS)
    const endTime = startTime + speechDurationMs

    this.emit('speech-segment', {
      audio,
      startTime,
      endTime,
      source: this.source,
    } as SpeechSegment)
  }

  /**
   * One Silero step: concat previous context + 512 samples → [1, 576], then update
   * context to the last 64 samples of the 576-sample window (matches Python OnnxWrapper).
   */
  private async _infer(frame: Float32Array): Promise<number> {
    if (!this.session || !this.ort) return -1

    try {
      this.modelInput.set(this.context, 0)
      this.modelInput.set(frame, CONTEXT_SIZE)

      const inputTensor = new this.ort.Tensor('float32', this.modelInput, [1, MODEL_INPUT_SIZE])
      const feeds: Record<string, any> = {
        input: inputTensor,
        state: this.state,
        sr: this.srTensor,
      }

      const results = await this.session.run(feeds)

      const probTensor = results.output ?? results[Object.keys(results)[0]]
      const newState = results.stateN ?? results[Object.keys(results)[1]]

      this.state = newState
      // Last 64 samples of [context | frame] = last 64 of the new 512-sample chunk
      this.context.set(this.modelInput.subarray(512, 576))

      const data = probTensor.data as Float32Array
      return data[0]
    } catch (err) {
      createLogger('vad').error(`[${this.source}] Inference error:`, err)
      return -1
    }
  }

  flush(): void {
    if (this.isSpeaking && this.speechFrames.length > 0) {
      this._emitSegment()
    }
    this._resetState()
  }

  destroy(): void {
    this.flush()
    this.session = null
    this.ort = null
    this.removeAllListeners()
  }
}
