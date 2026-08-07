/**
 * Anthropic (Claude) chat streaming — the Claude counterpart to the OpenAI path
 * in llm-service.ts. Takes the same OpenAI-shaped message array the
 * PromptAssembler produces and converts it to the Messages API shape.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '../logger'

const log = createLogger('anthropic-chat')

export type AnthropicModelId = 'claude-sonnet-5' | 'claude-opus-5'

export const ANTHROPIC_MODEL_CONFIGS: Record<
  AnthropicModelId,
  { id: string; apiModel: string; contextWindow: number; maxResponseTokens: number }
> = {
  'claude-sonnet-5': {
    id: 'claude-sonnet-5',
    apiModel: 'claude-sonnet-5',
    contextWindow: 1_000_000,
    maxResponseTokens: 64_000,
  },
  'claude-opus-5': {
    id: 'claude-opus-5',
    apiModel: 'claude-opus-5',
    contextWindow: 1_000_000,
    maxResponseTokens: 64_000,
  },
}

/** Standard rates; cached = cache-read (0.1x input). */
export const ANTHROPIC_MODEL_PRICING: Record<
  AnthropicModelId,
  { inputPer1M: number; outputPer1M: number; cachedPer1M: number }
> = {
  'claude-sonnet-5': { inputPer1M: 3.0, outputPer1M: 15.0, cachedPer1M: 0.3 },
  'claude-opus-5': { inputPer1M: 5.0, outputPer1M: 25.0, cachedPer1M: 0.5 },
}

export function isAnthropicModel(modelId: string): modelId is AnthropicModelId {
  return modelId in ANTHROPIC_MODEL_CONFIGS
}

/** OpenAI-shaped message, as produced by PromptAssembler + buildApiMessagesWithImages. */
type OpenAIShapedMessage = {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
}

/** data:image/png;base64,AAA → an Anthropic image block. Plain URLs pass through. */
function toImageBlock(url: string): Anthropic.ImageBlockParam {
  const match = url.match(/^data:([^;]+);base64,(.*)$/)
  if (!match) return { type: 'image', source: { type: 'url', url } }
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: match[1] as Anthropic.Base64ImageSource['media_type'],
      data: match[2],
    },
  }
}

/**
 * Split OpenAI-shaped messages into Anthropic's separate `system` string and
 * user/assistant turns. The assembler emits at most one system message.
 */
export function convertMessages(messages: OpenAIShapedMessage[]): {
  system: string | undefined
  messages: Anthropic.MessageParam[]
} {
  const systemParts: string[] = []
  const out: Anthropic.MessageParam[] = []

  for (const m of messages) {
    const text = typeof m.content === 'string' ? m.content : null
    if (m.role === 'system') {
      systemParts.push(text ?? '')
      continue
    }
    if (text !== null) {
      out.push({ role: m.role, content: text })
      continue
    }
    const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []
    for (const part of m.content as Exclude<OpenAIShapedMessage['content'], string>) {
      if (part.type === 'text') blocks.push({ type: 'text', text: part.text })
      else blocks.push(toImageBlock(part.image_url.url))
    }
    out.push({ role: m.role, content: blocks })
  }

  return { system: systemParts.join('\n\n') || undefined, messages: out }
}

export interface AnthropicStreamResult {
  fullContent: string
  usage: { promptTokens: number; completionTokens: number; cachedTokens: number }
}

/**
 * Stream a Claude response, calling onDelta for each text chunk.
 * Thinking is left at its default (adaptive) with low effort — disabling it on
 * Claude Opus 5 can leak `<thinking>` tags into the answer, and low effort is
 * the cheaper, safer lever for a live-meeting assistant.
 */
export async function streamAnthropicChat(opts: {
  apiKey: string
  model: AnthropicModelId
  messages: OpenAIShapedMessage[]
  maxTokens: number
  signal: AbortSignal
  onDelta: (delta: string) => void
}): Promise<AnthropicStreamResult> {
  const client = new Anthropic({ apiKey: opts.apiKey })
  const { system, messages } = convertMessages(opts.messages)

  const stream = client.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      ...(system ? { system } : {}),
      messages,
      output_config: { effort: 'low' },
      // Auto-caches the last cacheable block, so the growing conversation
      // prefix is read from cache on the next turn.
      cache_control: { type: 'ephemeral' },
    },
    { signal: opts.signal },
  )

  let fullContent = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullContent += event.delta.text
      opts.onDelta(event.delta.text)
    }
  }

  const final = await stream.finalMessage()
  const u = final.usage
  const cachedTokens = u.cache_read_input_tokens ?? 0
  const usage = {
    // App-wide convention: promptTokens is the whole prompt, cached included.
    promptTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + cachedTokens,
    completionTokens: u.output_tokens,
    cachedTokens,
  }

  if (final.stop_reason === 'refusal') {
    log.warn('[anthropic] Request refused by safety classifiers')
  }
  return { fullContent, usage }
}
