import { describe, expect, it } from 'vitest'
import { PromptAssembler } from './prompt-assembler'
import { TokenCounter } from './token-counter'

function charBudgetCounter(): TokenCounter {
  return {
    count: (text: string) => text.length,
    countMessages: (messages: Array<{ role: string; content: string }>) =>
      messages.reduce((sum, m) => sum + m.content.length + 4, 0),
    countTranscriptEntries: () => 0,
  } as unknown as TokenCounter
}

describe('PromptAssembler', () => {
  const assembler = new PromptAssembler(new TokenCounter())
  const assemblerTight = new PromptAssembler(charBudgetCounter())

  it('prepends system message when provided', () => {
    const { messages } = assembler.assemble({
      modelConfig: { contextWindow: 400_000, maxResponseTokens: 16_000 },
      systemPrompt: 'Be concise.',
      conversationMessages: [{ role: 'user', content: 'Hello' }],
    })
    expect(messages[0]).toEqual({ role: 'system', content: 'Be concise.' })
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello' })
  })

  it('omits system message when null', () => {
    const { messages } = assembler.assemble({
      modelConfig: { contextWindow: 400_000, maxResponseTokens: 16_000 },
      systemPrompt: null,
      conversationMessages: [{ role: 'user', content: 'Hello' }],
    })
    expect(messages.every((m) => m.role !== 'system')).toBe(true)
  })

  it('prepends transcript summary to last user message only', () => {
    const { messages } = assembler.assemble({
      modelConfig: { contextWindow: 400_000, maxResponseTokens: 16_000 },
      systemPrompt: 'sys',
      conversationMessages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'second question' },
      ],
      transcriptSummary: 'Earlier we discussed Q4.',
    })
    const lastUser = messages.filter((m) => m.role === 'user').pop()
    expect(lastUser?.content).toContain('<transcript_summary>')
    expect(lastUser?.content).toContain('Earlier we discussed Q4.')
    expect(lastUser?.content).toContain('second question')
    const firstUser = messages.find((m) => m.role === 'user' && m.content === 'first')
    expect(firstUser).toBeDefined()
  })

  it('drops oldest pairs when budget is exceeded and adds truncation note', () => {
    const filler = 'x'.repeat(600)
    const { messages, truncatedPairs } = assemblerTight.assemble({
      modelConfig: { contextWindow: 2500, maxResponseTokens: 200 },
      systemPrompt: null,
      conversationMessages: [
        { role: 'user', content: filler },
        { role: 'assistant', content: filler },
        { role: 'user', content: filler },
        { role: 'assistant', content: filler },
      ],
    })
    expect(truncatedPairs).toBeGreaterThan(0)
    const firstUser = messages.find((m) => m.role === 'user')
    expect(firstUser?.content).toMatch(/truncated/i)
  })
})
