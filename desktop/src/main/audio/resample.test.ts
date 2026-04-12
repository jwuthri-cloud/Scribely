import { describe, expect, it } from 'vitest'
import { linearResamplePcm } from './resample'

describe('linearResamplePcm', () => {
  it('returns same reference when rates match', () => {
    const pcm = new Float32Array([0.1, 0.2, 0.3])
    const out = linearResamplePcm(pcm, 16000, 16000)
    expect(out).toBe(pcm)
  })

  it('downsamples 48kHz to 16kHz (~3x fewer samples)', () => {
    const pcm = new Float32Array(4800).fill(0.5)
    const out = linearResamplePcm(pcm, 48000, 16000)
    expect(out.length).toBe(1600)
  })

  it('preserves DC signal approximately', () => {
    const pcm = new Float32Array(3000).fill(0.25)
    const out = linearResamplePcm(pcm, 48000, 16000)
    expect(out[out.length - 1]).toBeCloseTo(0.25, 5)
  })

  it('interpolates between adjacent samples', () => {
    const pcm = new Float32Array([0, 1, 1])
    const out = linearResamplePcm(pcm, 48000, 24000)
    expect(out.length).toBe(2)
    expect(out[0]).toBeCloseTo(0, 5)
    expect(out[1]).toBeCloseTo(1, 5)
  })
})
