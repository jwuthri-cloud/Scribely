/**
 * Generate 2-3 follow-up questions for a given context (e.g. a question from a meeting).
 * Used by Live Insights "Suggest follow-up questions" — displays in the insight card
 * instead of the main chat. Uses the current transcript for context.
 */

import type OpenAI from 'openai'
import { createLogger } from '../logger'

const log = createLogger('follow-up-suggestions')

const FOLLOW_UP_MODEL = 'gpt-5.4-nano'

const SYSTEM_PROMPT = `You are a meeting assistant. Given a meeting transcript and a question or topic that was raised, generate 2-3 concise follow-up questions that help clarify or expand on it, using the transcript context.
Output only the questions as a bullet list (markdown format: - or *). No preamble, no numbering, no extra text.
LANGUAGE: Generate the follow-up questions in the same language as the transcript and the question/topic. If they are in French, output in French. If in English, output in English.`

export interface TranscriptEntryInput {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source?: string
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function formatTranscript(entries: TranscriptEntryInput[]): string {
  return entries
    .map((e) => `[${formatTimestamp(e.startTime)}] ${e.speaker}: ${e.text}`)
    .join('\n')
}

/** Max transcript entries to include (last N = most recent) */
const MAX_TRANSCRIPT_ENTRIES = 80

export interface FollowUpResult {
  content: string
  error?: string
}

export interface FollowUpOptions {
  /** Model to use (default gpt-5.4-nano for OpenAI) */
  model?: string
  /** Omit OpenAI-specific params for local providers */
  stripOpenAIParams?: boolean
}

export async function runSuggestFollowUp(
  client: OpenAI,
  prompt: string,
  transcriptEntries: TranscriptEntryInput[] = [],
  options: FollowUpOptions = {},
): Promise<FollowUpResult> {
  const { model = FOLLOW_UP_MODEL, stripOpenAIParams = false } = options
  log.info(`Suggest follow-up: "${prompt.slice(0, 80)}..." (${transcriptEntries.length} transcript entries)`)
  try {
    const recent = transcriptEntries.slice(-MAX_TRANSCRIPT_ENTRIES)
    const transcriptBlock =
      recent.length > 0
        ? `MEETING TRANSCRIPT:\n${formatTranscript(recent)}\n\n`
        : ''

    const userContent = `${transcriptBlock}QUESTION/TOPIC TO EXPAND ON:\n${prompt}`

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 512,
      ...(stripOpenAIParams ? {} : { reasoning_effort: 'low' as const }),
    })

    const content = response.choices?.[0]?.message?.content
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) {
      return { content: '', error: 'No response from model' }
    }
    return { content: text }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Follow-up suggestions failed'
    log.error('Follow-up suggestions error:', err)
    return { content: '', error: message }
  }
}
