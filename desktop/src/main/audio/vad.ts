import { EventEmitter } from 'events'

// ── Constants ──────────────────────────────────────────────
// Silero VAD v5 expects 512-sample frames at 16kHz (= 32ms per frame)
const VAD_FRAME_SIZE = 512
const VAD_SAMPLE_RATE = 16000
const FRAME_DURATION_MS = (VAD_FRAME_SIZE / VAD_SAMPLE_RATE) * 1000 // 32ms

// Silero VAD v5 LSTM state dimensions
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
  // ONNX Runtime (lazily loaded — typed as any because we require() at runtime)
  private ort: any = null
  private session: any = null

  // Model state tensors
  private state: any = null // ort.Tensor [2, 1, 128]
  private srTensor: any = null // ort.Tensor [1]

  // Speech detection state
  private isSpeaking = false
  private speechStartFrame = 0
  private frameCount = 0
  private speechFrames: Float32Array[] = []
  private preSpeechBuffer: Float32Array[] = [] // circular buffer for pre-speech context
  private consecutiveSpeechFrames = 0
  private consecutiveSilenceFrames = 0

  // Leftover samples from previous processChunk call (< 512)
  private leftover: Float32Array | null = null

  // Instance config
  private source: string

  constructor(source: string) {
    super()
    this.source = source
  }

  get isReady(): boolean {
    return this.session !== null
  }

  // ── Initialization ─────────────────────────────────────

  async init(modelPath: string): Promise<boolean> {
    try {
      this.ort = require('onnxruntime-node')
      this.session = await this.ort!.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
      })
      this._resetState()
      console.log(`[vad:${this.source}] Silero VAD v5 initialized (${modelPath})`)
      return true
    } catch (err) {
      console.warn(`[vad:${this.source}] Init failed — VAD disabled:`, err)
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
    this.isSpeaking = false
    this.speechFrames = []
    this.preSpeechBuffer = []
    this.consecutiveSpeechFrames = 0
    this.consecutiveSilenceFrames = 0
    this.speechStartFrame = 0
    this.frameCount = 0
    this.leftover = null
  }

  // ── Public: process a chunk of audio (any size, any rate) ─

  /**
   * Feed a chunk of PCM audio to the VAD.
   * Automatically resamples to 16kHz and splits into 512-sample frames.
   * Emits 'speech-segment' events when speech is detected and ends.
   */
  async processChunk(pcm: Float32Array, sampleRate: number): Promise<void> {
    if (!this.session) return

    // Resample to 16kHz if needed
    let audio = sampleRate !== VAD_SAMPLE_RATE ? resample(pcm, sampleRate, VAD_SAMPLE_RATE) : pcm

    // Prepend leftover from previous call
    if (this.leftover) {
      const merged = new Float32Array(this.leftover.length + audio.length)
      merged.set(this.leftover)
      merged.set(audio, this.leftover.length)
      audio = merged
      this.leftover = null
    }

    // Process in 512-sample frames
    let offset = 0
    while (offset + VAD_FRAME_SIZE <= audio.length) {
      const frame = audio.subarray(offset, offset + VAD_FRAME_SIZE)
      await this._processFrame(frame)
      offset += VAD_FRAME_SIZE
    }

    // Save leftover for next call
    if (offset < audio.length) {
      this.leftover = new Float32Array(audio.subarray(offset))
    }
  }

  // ── Core frame processing with hysteresis ──────────────

  private async _processFrame(frame: Float32Array): Promise<void> {
    const probability = await this._infer(frame)
    if (probability < 0) return // inference failed

    this.frameCount++

    if (!this.isSpeaking) {
      this._handleNonSpeech(frame, probability)
    } else {
      this._handleSpeech(frame, probability)
    }
  }

  private _handleNonSpeech(frame: Float32Array, probability: number): void {
    // Maintain circular pre-speech buffer
    this.preSpeechBuffer.push(new Float32Array(frame))
    while (this.preSpeechBuffer.length > PRE_SPEECH_PADDING_FRAMES) {
      this.preSpeechBuffer.shift()
    }

    if (probability >= START_THRESHOLD) {
      this.consecutiveSpeechFrames++
      if (this.consecutiveSpeechFrames >= MIN_CONFIRM_FRAMES) {
        // Speech confirmed — transition to speaking state
        this.isSpeaking = true
        this.speechStartFrame = this.frameCount - this.preSpeechBuffer.length
        if (this.speechStartFrame < 0) this.speechStartFrame = 0

        // Start with pre-speech padding for natural sounding onset
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
        // Speech ended — emit segment if long enough
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

  // ── Emit accumulated speech as a segment ───────────────

  private _emitSegment(): void {
    const numFrames = this.speechFrames.length
    const speechDurationMs = numFrames * FRAME_DURATION_MS

    if (speechDurationMs < MIN_SPEECH_FRAMES * FRAME_DURATION_MS) {
      return // too short, discard
    }

    // Concatenate speech frames into a single Float32Array
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

  // ── ONNX inference ─────────────────────────────────────

  private async _infer(frame: Float32Array): Promise<number> {
    if (!this.session || !this.ort) return -1

    try {
      const inputTensor = new this.ort.Tensor('float32', frame, [1, VAD_FRAME_SIZE])
      const feeds: Record<string, any> = {
        input: inputTensor,
        state: this.state,
        sr: this.srTensor,
      }

      const results = await this.session.run(feeds)

      // Silero VAD v5 outputs: "output" (probability) and "stateN" (new state)
      const outputKeys = Object.keys(results)
      const probTensor = results['output'] || results[outputKeys[0]]
      const newState = results['stateN'] || results[outputKeys[1]]

      // Update internal state for next frame
      this.state = newState

      return (probTensor.data as Float32Array)[0]
    } catch (err) {
      console.error(`[vad:${this.source}] Inference error:`, err)
      return -1
    }
  }

  // ── Flush remaining speech (call when session ends) ────

  flush(): void {
    if (this.isSpeaking && this.speechFrames.length > 0) {
      this._emitSegment()
    }
    this._resetState()
  }

  // ── Cleanup ────────────────────────────────────────────

  destroy(): void {
    this.flush()
    this.session = null
    this.ort = null
    this.removeAllListeners()
  }
}
