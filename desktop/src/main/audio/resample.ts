/**
 * Linear interpolation resampling for mono Float32 PCM.
 * Used by the audio pipeline and VAD when input sample rate ≠ target (e.g. 48kHz → 16kHz).
 */
export function linearResamplePcm(
  pcm: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
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
