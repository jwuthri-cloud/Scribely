/**
 * Fast token count estimator for prompt budget management.
 *
 * Uses a word-based heuristic (~1.3 tokens per English word) that is
 * ~90% accurate without requiring a WASM tokenizer dependency.
 * For production, swap `count()` to use `gpt-tokenizer` for exact counts.
 */
export class TokenCounter {
  /** Approximate token count for a text string. */
  count(text: string): number {
    if (!text) return 0
    const words = text.split(/\s+/).filter(Boolean)
    return Math.ceil(words.length * 1.3)
  }

  /** Count tokens for an array of transcript entries (with formatting overhead). */
  countTranscriptEntries(
    entries: Array<{ speaker: string; text: string; startTime: number }>,
  ): number {
    let total = 0
    for (const entry of entries) {
      // "[HH:MM] Speaker: text\n" overhead ~= 10 tokens per entry
      total += this.count(entry.text) + 10
    }
    return total
  }

  /** Count tokens for conversation messages (with role overhead). */
  countMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 0
    for (const msg of messages) {
      // role token + content + message overhead ~= 4 tokens
      total += this.count(msg.content) + 4
    }
    return total
  }
}
