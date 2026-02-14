/**
 * Background transcript summarizer for Phase 2 scaling.
 *
 * Runs async using gpt5-nano. Processes entries[0] through entries[length - 25],
 * keeping the last 25 as raw. Incremental: each run includes the previous summary
 * as context. Does not block chat.
 */

import type OpenAI from 'openai'
import { TranscriptMemory } from './transcript-memory'

interface TranscriptEntry {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source: string
}

const GPT5_NANO_MODEL = 'gpt-5-nano'
const DEFAULT_KEEP_RAW_COUNT = 5

const DEFAULT_SUMMARIZE_SYSTEM = `You are a meeting transcript summarizer. Produce a concise summary that captures:
- Main topics discussed
- Key decisions or conclusions
- Action items or follow-ups mentioned
- Important context for later questions

Keep the summary under 500 words. Use clear paragraphs. Do not include timestamps.`

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
  /** Number of most recent entries to keep unsummarized (default 25) */
  keepRawCount?: number
  /** Custom system prompt. Null/undefined = use default. */
  systemPrompt?: string | null
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
  const { client, transcriptMemory, entries, keepRawCount = DEFAULT_KEEP_RAW_COUNT, systemPrompt } = input
  const summarizeSystem = systemPrompt?.trim() || DEFAULT_SUMMARIZE_SYSTEM

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
  console.log(
    `[background-summarizer] Summarizing entries 0-${toSummarizeEnd - 1} (${toSummarizeEnd} entries), keeping last ${effectiveKeep} raw`,
  )

  const toSummarize = entries.slice(0, toSummarizeEnd)
  const formatted = toSummarize.map(formatEntry).join('\n')

  if (!formatted.trim()) {
    return { summary: null, error: 'Transcript has no text to summarize' }
  }

  transcriptMemory.setSummarizationInProgress(true)
  console.log(
    '[background-summarizer] Starting —',
    toSummarizeEnd,
    'entries to summarize',
  )

  const resetInProgress = (): void => {
    transcriptMemory.setSummarizationInProgress(false)
  }

  try {
    const previousSummary = transcriptMemory.getSummary()

    const userContent = previousSummary
      ? `PREVIOUS SUMMARY (for context — extend/update with new content):\n${previousSummary}\n\n---\n\nNEW TRANSCRIPT TO SUMMARIZE:\n${formatted}`
      : `TRANSCRIPT TO SUMMARIZE:\n${formatted}`

    const response = await client.chat.completions.create({
      model: GPT5_NANO_MODEL,
      messages: [
        { role: 'system', content: summarizeSystem },
        { role: 'user', content: userContent },
      ],
      // gpt-5-nano is a reasoning model — reasoning tokens + output tokens
      // must both fit within max_completion_tokens. 1024 was entirely consumed
      // by reasoning, leaving 0 for output. 4096 gives plenty of room.
      max_completion_tokens: 4096,
      reasoning_effort: 'low',
    })

    // Log the full response structure for debugging
    console.log(
      '[background-summarizer] API response:',
      JSON.stringify(response, null, 2).slice(0, 2000),
    )

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
      console.log('[background-summarizer] Done —', summary.length, 'chars')
      return { summary }
    }

    resetInProgress()
    return { summary: null, error: 'Summarization produced no output' }
  } catch (err: any) {
    console.error('[background-summarizer] Summarization failed:', err)
    resetInProgress()
    return { summary: null, error: err?.message ?? 'Summarization failed' }
  }
}
