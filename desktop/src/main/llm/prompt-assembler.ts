import { TokenCounter } from './token-counter'

// ── Types ─────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ModelConfig {
  contextWindow: number
  maxResponseTokens: number
}

export interface AssembleInput {
  modelConfig: ModelConfig
  /** Optional system prompt content. Omitted entirely if null/undefined. */
  systemPrompt: string | null
  /** Full conversation history -- user messages already contain transcript deltas in their content. */
  conversationMessages: ConversationMessage[]
  /** Optional transcript summary (Phase 2 safety net). Prepended to the LAST user message when present. */
  transcriptSummary?: string | null
}

export interface AssembledPrompt {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  tokenEstimate: number
  /** Number of oldest message pairs that were dropped to fit context budget */
  truncatedPairs: number
}

// ── Prompt Assembler (Append-Only Strategy) ──────────────
//
// The append-only strategy embeds transcript deltas directly in user messages.
// Each user message carries only the NEW transcript entries since the previous
// message. This produces a strictly append-only prefix that is ideal for
// OpenAI prefix caching:
//
//   messages[0]: { system prompt }                         ← STABLE (never changes)
//   messages[1]: { user: "<transcript>...</transcript>\n<user_query>Q1</user_query>" }  ← CACHED
//   messages[2]: { assistant: "A1" }                       ← CACHED
//   messages[3]: { user: "<transcript_summary>...</transcript_summary>\n<transcript>...</transcript>\n<user_query>Q2</user_query>" } ← NEW
//
// The transcript summary (Phase 2) is prepended to the LAST user message only.
// This way:
//   - Only ONE system message (stable, never changes) → perfect prefix cache
//   - Old messages are never modified → append-only
//   - Summary rides with the new content that's already uncached
//
// When context overflows, oldest user+assistant pairs are dropped from the
// beginning. A note is prepended to the first remaining user message.

export class PromptAssembler {
  private counter: TokenCounter

  constructor(counter: TokenCounter) {
    this.counter = counter
  }

  assemble(input: AssembleInput): AssembledPrompt {
    const {
      modelConfig,
      systemPrompt,
      conversationMessages,
      transcriptSummary,
    } = input

    // ── System prompt tokens ──
    const systemTokens = systemPrompt ? this.counter.count(systemPrompt) + 4 : 0

    // ── Transcript summary tokens (reserved from budget even though it goes in the last user msg) ──
    const summaryBlock = transcriptSummary
      ? `<transcript_summary>\n${transcriptSummary}\n</transcript_summary>\n\n`
      : ''
    const summaryTokens = summaryBlock
      ? this.counter.count(summaryBlock)
      : 0

    // ── Available budget for conversation messages ──
    const margin = 200
    const available =
      modelConfig.contextWindow -
      systemTokens -
      summaryTokens -
      modelConfig.maxResponseTokens -
      margin

    // ── Truncate oldest message pairs if needed ──
    const { messages: fittedMessages, truncatedPairs } = this.fitMessages(
      conversationMessages,
      available,
    )

    // ── Prepend transcript summary to the LAST user message ──
    if (summaryBlock && fittedMessages.length > 0) {
      // Find the last user message (should be the final element)
      for (let i = fittedMessages.length - 1; i >= 0; i--) {
        if (fittedMessages[i].role === 'user') {
          fittedMessages[i] = {
            ...fittedMessages[i],
            content: summaryBlock + fittedMessages[i].content,
          }
          break
        }
      }
    }

    // ── Build final messages array ──
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    for (const msg of fittedMessages) {
      messages.push({ role: msg.role, content: msg.content })
    }

    const tokenEstimate = this.counter.countMessages(messages)

    return { messages, tokenEstimate, truncatedPairs }
  }

  /**
   * Fit conversation messages within the token budget.
   * Drops oldest user+assistant pairs first. If truncation happens,
   * prepends a note to the first remaining user message.
   */
  private fitMessages(
    messages: ConversationMessage[],
    budget: number,
  ): { messages: ConversationMessage[]; truncatedPairs: number } {
    if (messages.length === 0) {
      return { messages: [], truncatedPairs: 0 }
    }

    // Check if everything fits
    const totalTokens = this.counter.countMessages(messages)
    if (totalTokens <= budget) {
      return { messages: [...messages], truncatedPairs: 0 }
    }

    // Drop oldest pairs (user + assistant) from the front until it fits.
    // We drop in pairs to keep conversation coherent.
    const result = [...messages]
    let truncatedPairs = 0

    while (result.length > 1 && this.counter.countMessages(result) > budget) {
      // Drop a user+assistant pair from the front
      if (result.length >= 2 && result[0].role === 'user' && result[1].role === 'assistant') {
        result.splice(0, 2)
        truncatedPairs++
      } else if (result[0].role === 'assistant') {
        // Orphaned assistant message at front -- drop it
        result.splice(0, 1)
      } else if (result[0].role === 'user' && (result.length < 2 || result[1].role === 'user')) {
        // Orphaned user message (no matching assistant) -- drop it
        result.splice(0, 1)
        truncatedPairs++
      } else {
        // Safety: drop one message to avoid infinite loop
        result.splice(0, 1)
      }
    }

    // If we truncated, prepend a note to the first remaining user message
    if (truncatedPairs > 0) {
      const firstUserIdx = result.findIndex((m) => m.role === 'user')
      if (firstUserIdx !== -1) {
        const note = `[Earlier conversation messages truncated — ${truncatedPairs} message pair${truncatedPairs > 1 ? 's' : ''} removed]\n\n`
        result[firstUserIdx] = {
          ...result[firstUserIdx],
          content: note + result[firstUserIdx].content,
        }
      }
    }

    return { messages: result, truncatedPairs }
  }
}
