/**
 * Background transcript summarizer for Phase 2 scaling.
 *
 * Runs async using gpt-5.4-nano. Processes entries[0] through entries[length - 25],
 * keeping the last 25 as raw. Incremental: each run includes the previous summary
 * as context. Does not block chat.
 */

import type OpenAI from 'openai'
import { createLogger } from '../logger'
import { propagateAttributes } from '@langfuse/tracing'
import { DEFAULT_SUMMARIZER_SYSTEM_PROMPT } from '../../shared/summarizer-defaults'
import { TranscriptMemory } from './transcript-memory'

interface TranscriptEntry {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source: string
}

const log = createLogger('background-summarizer')
const GPT5_NANO_MODEL = 'gpt-5.4-nano'
const DEFAULT_KEEP_RAW_COUNT = 5

function formatEntry(entry: TranscriptEntry): string {
  const min = Math.floor(entry.startTime / 60000)
  const sec = Math.floor((entry.startTime % 60000) / 1000)
  const time = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `[${time}] ${entry.speaker}: ${entry.text}`
}

export interface SummarizerInput {
  client: OpenAI
  transcriptMemory: TranscriptMemory
  entries: TranscriptEntry[]
  /** Model to use (e.g. gpt-5.4-nano for OpenAI, llama3.2 for Ollama) */
  model?: string
  /** Omit OpenAI-specific params (reasoning_effort) for local providers */
  stripOpenAIParams?: boolean
  /** Number of most recent entries to keep unsummarized (default 25) */
  keepRawCount?: number
  /** Custom system prompt. Null/undefined = use default. */
  systemPrompt?: string | null
  /** Langfuse userId for trace filtering (e.g. device ID) */
  userId?: string
  /** Langfuse sessionId for trace grouping */
  sessionId?: string
}

export interface SummarizerResult {
  summary: string | null
  error?: string
}

/**
 * Summarize transcript entries from [0] through [length - KEEP_RAW_COUNT - 1].
 * If there are <= KEEP_RAW_COUNT entries, returns null (nothing to summarize).
 */
export async function runBackgroundSummarization(
  input: SummarizerInput,
): Promise<SummarizerResult> {
  const {
    client,
    transcriptMemory,
    entries,
    model = GPT5_NANO_MODEL,
    stripOpenAIParams = false,
    keepRawCount = DEFAULT_KEEP_RAW_COUNT,
    systemPrompt,
    userId,
    sessionId,
  } = input
  const summarizeSystem = systemPrompt?.trim() || DEFAULT_SUMMARIZER_SYSTEM_PROMPT

  // Keep a small number of the most recent entries unsummarized so they
  // remain available verbatim. Use the smaller of keepRawCount or 20% of
  // entries, with a minimum of 3, so short meetings still get a useful summary.
  const effectiveKeep = Math.min(keepRawCount, Math.max(3, Math.floor(entries.length * 0.2)))
  const toSummarizeEnd = Math.max(0, entries.length - effectiveKeep)
  if (toSummarizeEnd === 0) {
    return {
      summary: null,
      error:
        entries.length === 0
          ? 'No transcript to summarize'
          : `Need more than ${effectiveKeep} transcript entries to summarize`,
    }
  }
  log.info(
    `Summarizing entries 0-${toSummarizeEnd - 1} (${toSummarizeEnd} entries), keeping last ${effectiveKeep} raw`,
  )

  const toSummarize = entries.slice(0, toSummarizeEnd)
  const formatted = toSummarize.map(formatEntry).join('\n')

  if (!formatted.trim()) {
    return { summary: null, error: 'Transcript has no text to summarize' }
  }

  transcriptMemory.setSummarizationInProgress(true)
  log.info('Starting —', toSummarizeEnd, 'entries to summarize')

  const resetInProgress = (): void => {
    transcriptMemory.setSummarizationInProgress(false)
  }

  try {
    const previousSummary = transcriptMemory.getSummary()

    const userContent = previousSummary
      ? `PREVIOUS SUMMARY (for context — extend/update with new content):\n${previousSummary}\n\n---\n\nNEW TRANSCRIPT TO SUMMARIZE:\n${formatted}`
      : `TRANSCRIPT TO SUMMARIZE:\n${formatted}`

    const doSummarize = async () =>
      client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: summarizeSystem },
          { role: 'user', content: userContent },
        ],
        max_completion_tokens: 10000,
        ...(stripOpenAIParams ? {} : { reasoning_effort: 'low' as const }),
      })

    const response = await (userId || sessionId
      ? propagateAttributes(
          { ...(userId && { userId }), ...(sessionId && { sessionId }) },
          doSummarize,
        )
      : doSummarize())

    // Log the full response structure for debugging
    log.debug('API response:', JSON.stringify(response, null, 2).slice(0, 2000))

    // Extract summary from response — try multiple formats
    let summary: string | null = null

    // Standard chat completions: choices[0].message.content (string)
    const content = response.choices?.[0]?.message?.content
    if (typeof content === 'string' && content.trim()) {
      summary = content.trim()
    }

    // Content as array of parts: [{type: "text", text: "..."}, ...]
    if (!summary && Array.isArray(content)) {
      const text = (content as Array<Record<string, unknown>>)
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim()
      if (text) summary = text
    }

    // Responses API format: response.output[].content[].text
    const resp = response as unknown as Record<string, unknown>
    if (!summary && Array.isArray(resp.output)) {
      const text = (resp.output as Array<Record<string, unknown>>)
        .flatMap((o) => {
          if (typeof o?.text === 'string') return [o.text]
          if (Array.isArray(o?.content)) {
            return (o.content as Array<Record<string, unknown>>).map((c) =>
              typeof c?.text === 'string' ? c.text : '',
            )
          }
          return []
        })
        .join('')
        .trim()
      if (text) summary = text
    }

    // Top-level output_text
    if (!summary && typeof resp.output_text === 'string') {
      summary = (resp.output_text as string).trim() || null
    }

    if (summary) {
      transcriptMemory.updateSummary(summary, toSummarizeEnd - 1)
      log.success('Done —', summary.length, 'chars')
      return { summary }
    }

    resetInProgress()
    return { summary: null, error: 'Summarization produced no output' }
  } catch (err: any) {
    log.error('Summarization failed:', err)
    resetInProgress()
    return { summary: null, error: err?.message ?? 'Summarization failed' }
  }
}
