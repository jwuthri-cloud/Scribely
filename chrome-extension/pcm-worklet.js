/**
 * AudioWorkletProcessor that extracts PCM Float32 samples from a
 * MediaStream and posts them to the main thread.
 *
 * Runs in the AudioWorklet thread for low-latency, glitch-free capture.
 * Accumulates samples into ~4096-sample buffers (~256ms at 16kHz) before
 * posting to keep message overhead reasonable.
 */
class PcmExtractorProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = new Float32Array(4096)
    this._offset = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true

    const channelData = input[0] // mono
    if (!channelData) return true

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._offset++] = channelData[i]

      if (this._offset >= this._buffer.length) {
        // Copy and post the full buffer
        this.port.postMessage({
          pcm: this._buffer.slice().buffer,
        }, [this._buffer.slice().buffer])
        this._offset = 0
      }
    }

    return true
  }
}

registerProcessor('pcm-extractor', PcmExtractorProcessor)
