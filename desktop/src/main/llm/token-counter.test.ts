import { describe, expect, it } from 'vitest'
import { TokenCounter } from './token-counter'

describe('TokenCounter', () => {
  const counter = new TokenCounter()

  it('counts empty string as zero', () => {
    expect(counter.count('')).toBe(0)
  })

  it('counts non-empty text', () => {
    expect(counter.count('hello world')).toBeGreaterThan(0)
  })

  it('countTranscriptEntries formats and sums tokens', () => {
    const n = counter.countTranscriptEntries([
      { speaker: 'Them', text: 'Hello.', startTime: 65000 },
    ])
    expect(n).toBeGreaterThan(0)
  })

  it('countMessages includes role overhead', () => {
    const a = counter.countMessages([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ])
    const raw = counter.count('You are helpful.') + counter.count('Hi')
    expect(a).toBeGreaterThan(raw)
  })
})
