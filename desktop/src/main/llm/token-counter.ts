import { countTokens, encodeChat } from 'gpt-tokenizer'

/**
 * Model name recognized by gpt-tokenizer for chat overhead calculation (o200k_base).
 * ponytail: gpt-tokenizer doesn't know the 5.6 ids yet; any o200k_base model gives the
 * same count. Swap to a gpt-5.6-* id once the package ships them.
 */
const CHAT_MODEL = 'gpt-5-mini' as const

/**
 * Precise token counter using gpt-tokenizer (o200k_base encoding for GPT-5 series).
 * Replaces the word-heuristic for accurate budget management and cost estimation.
 */
export class TokenCounter {
  /** Precise token count for a text string. */
  count(text: string): number {
    if (!text) return 0
    return countTokens(text)
  }

  /** Count tokens for an array of transcript entries (with formatting overhead). */
  countTranscriptEntries(
    entries: Array<{ speaker: string; text: string; startTime: number }>,
  ): number {
    let total = 0
    for (const entry of entries) {
      const totalSec = Math.floor(entry.startTime / 1000)
      const min = Math.floor(totalSec / 60)
      const sec = totalSec % 60
      const ts = `${min}:${String(sec).padStart(2, '0')}`
      const formatted = `[${ts}] ${entry.speaker}: ${entry.text}\n`
      total += this.count(formatted)
    }
    return total
  }

  /**
   * Count tokens for conversation messages (with role overhead).
   * Uses encodeChat with model — countTokens(chat) requires a model for chat format.
   */
  countMessages(messages: Array<{ role: string; content: string }>): number {
    if (messages.length === 0) return 0
    const chat = messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }))
    const tokens = encodeChat(chat, CHAT_MODEL)
    return tokens.length
  }
}
