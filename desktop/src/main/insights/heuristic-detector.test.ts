import { describe, expect, it } from 'vitest'
import { HeuristicDetector } from './heuristic-detector'

function entry(overrides: Partial<{ text: string; id: string }> = {}) {
  return {
    id: overrides.id ?? 'e1',
    speaker: 'Them',
    text: overrides.text ?? 'Hello world.',
    startTime: 0,
    endTime: 1000,
    source: 'test',
  }
}

describe('HeuristicDetector', () => {
  it('detects questions with high confidence when sentence ends with ?', () => {
    const d = new HeuristicDetector()
    const ev = d.detect(entry({ text: 'What is the deadline for the project?' }))
    expect(ev).not.toBeNull()
    expect(ev?.type).toBe('question')
    expect(ev?.confidence).toBeGreaterThanOrEqual(0.4)
  })

  it('returns null for very short text', () => {
    const d = new HeuristicDetector()
    expect(d.detect(entry({ text: 'Hi?' }))).toBeNull()
  })

  it('skips question detection when disabled', () => {
    const d = new HeuristicDetector({ disabledTypes: new Set(['question']) })
    expect(d.detect(entry({ text: 'What do you think about this plan?' }))).toBeNull()
  })

  it('detects decision keywords', () => {
    const d = new HeuristicDetector()
    const ev = d.detect(entry({ text: "So we are going with the smaller scope for this release." }))
    expect(ev).not.toBeNull()
    expect(ev?.type).toBe('decision')
  })

  it('detects key mentions (e.g. URL)', () => {
    const d = new HeuristicDetector()
    const ev = d.detect(
      entry({ text: 'Please review https://example.com/spec before tomorrow.' }),
    )
    expect(ev).not.toBeNull()
    expect(ev?.type).toBe('key_mention')
  })

  it('detectAll returns multiple candidates when applicable', () => {
    const d = new HeuristicDetector()
    const all = d.detectAll(
      entry({ text: 'We decided the budget is $5000 — what do you think?' }),
    )
    expect(all.length).toBeGreaterThanOrEqual(1)
  })
})
