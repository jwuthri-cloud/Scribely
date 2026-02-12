/**
 * AudioWorklet processor that receives PCM data via postMessage
 * and outputs it as audio.  Used to inject Electron mic audio
 * into the offscreen document's recording mixer.
 *
 * The processor runs at the AudioContext's sample rate (e.g. 48 kHz)
 * and upsamples from the source rate (e.g. 16 kHz) using linear
 * interpolation.  A 4-second ring buffer absorbs jitter.
 *
 * Usage:
 *   const node = new AudioWorkletNode(ctx, 'pcm-injector', {
 *     processorOptions: { sourceRate: 16000 }
 *   })
 *   node.port.postMessage(float32ArrayBuffer, [float32ArrayBuffer])
 */
class PCMInjectorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const sourceRate = options.processorOptions?.sourceRate || 16000
    // Ratio of context rate to source rate (e.g. 48000/16000 = 3)
    this._ratio = sampleRate / sourceRate

    // Ring buffer — power-of-2 size for fast wrapping via bitmask
    // 65536 samples ≈ 4 s at 16 kHz, plenty for jitter absorption
    this._buf = new Float32Array(65536)
    this._mask = 65535
    this._wr = 0       // integer write position (source samples)
    this._rd = 0.0     // fractional read position (source samples)

    this.port.onmessage = (e) => {
      const pcm = new Float32Array(e.data)
      for (let i = 0; i < pcm.length; i++) {
        this._buf[(this._wr++) & this._mask] = pcm[i]
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0]?.[0]
    if (!out) return true

    for (let i = 0; i < out.length; i++) {
      const srcIdx = this._rd
      const srcFloor = Math.floor(srcIdx)

      if (srcFloor + 1 < this._wr) {
        // Linear interpolation between two source samples
        const s0 = this._buf[srcFloor & this._mask]
        const s1 = this._buf[(srcFloor + 1) & this._mask]
        const frac = srcIdx - srcFloor
        out[i] = s0 + (s1 - s0) * frac
      } else {
        out[i] = 0 // buffer underrun — output silence
      }

      // Advance read position: 1 output sample = 1/ratio source samples
      this._rd += 1.0 / this._ratio
    }

    return true
  }
}

registerProcessor('pcm-injector', PCMInjectorProcessor)
