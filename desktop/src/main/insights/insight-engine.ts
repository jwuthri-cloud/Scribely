/**
 * Insight Engine: orchestrates heuristic detection, optional LLM enrichment,
 * deduplication, and IPC emission for Live Insights.
 */

import { randomUUID } from 'crypto'
import type { DetectedEvent, Insight, InsightAction } from './types'
import type { HeuristicDetectorConfig } from './heuristic-detector'
import { HeuristicDetector } from './heuristic-detector'

export interface TranscriptEntryLike {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source: string
}

export interface InsightEngineConfig {
  /** Send insight to renderer */
  sendToRenderer: (channel: string, data: unknown) => void
  /** Optional: validate question events via LLM. Returns question text or null if "na". */
  validate?: (event: DetectedEvent, transcriptContext: string) => Promise<string | null>
  /** Optional: enrich event via LLM. Returns enriched title/description/actions. */
  enrich?: (event: DetectedEvent) => Promise<{
    title?: string
    description?: string
    suggestedActions?: InsightAction[]
  } | null>
  /** Enable LLM enrichment (default: true if enrich provided) */
  enrichmentEnabled?: boolean
  /** Debounce window in ms for same-type events (default: 10000) */
  debounceMs?: number
  /** Max enrichment calls per 15s (default: 1) */
  maxEnrichmentPerWindow?: number
  /** Max transcript context tokens for validation (default: 500) */
  maxContextTokens?: number
  /** Max transcript context time window in ms (default: 3 min) */
  maxContextMs?: number
}

const DEFAULT_DEBOUNCE_MS = 10_000
const ENRICHMENT_WINDOW_MS = 15_000
const MAX_CONTEXT_TOKENS = 500
const MAX_CONTEXT_MS = 3 * 60 * 1000 // 3 minutes
const CHARS_PER_TOKEN = 4 // rough estimate

function buildDefaultActions(event: DetectedEvent): InsightAction[] {
  const actions: InsightAction[] = []

  switch (event.type) {
    case 'question':
      actions.push({
        id: randomUUID(),
        label: 'Answer now',
        type: 'answer',
        payload: event.text,
        icon: 'sparkle',
      })
      actions.push({
        id: randomUUID(),
        label: 'Search the web',
        type: 'search',
        payload: event.text,
        icon: 'search',
      })
      actions.push({
        id: randomUUID(),
        label: 'Suggest follow-up questions',
        type: 'follow_up',
        payload: `Suggest 2-3 follow-up questions for: ${event.text}`,
        icon: 'chat',
      })
      break
    case 'key_mention':
      if (event.metadata?.entity || event.metadata?.amount) {
        const query =
          typeof event.metadata.entity === 'string'
            ? `${event.metadata.entity} ${event.metadata.amount || ''}`.trim()
            : event.text
        actions.push({
          id: randomUUID(),
          label: 'Search the web',
          type: 'search',
          payload: query,
          icon: 'search',
        })
      }
      break
    case 'action_item':
      actions.push({
        id: randomUUID(),
        label: 'Add to notes',
        type: 'summarize',
        payload: event.text,
        icon: 'document',
      })
      break
    case 'topic_change':
      actions.push({
        id: randomUUID(),
        label: 'Summarize this topic',
        type: 'summarize',
        payload: event.text,
        icon: 'document',
      })
      break
    case 'decision':
      actions.push({
        id: randomUUID(),
        label: 'Copy to clipboard',
        type: 'summarize',
        payload: event.text,
        icon: 'document',
      })
      break
  }

  if (actions.length === 0) {
    actions.push({
      id: randomUUID(),
      label: 'Get more info',
      type: 'answer',
      payload: event.text,
      icon: 'sparkle',
    })
  }

  return actions
}

function buildDefaultTitle(event: DetectedEvent): string {
  switch (event.type) {
    case 'question':
      return `${event.speaker} asked a question`
    case 'topic_change':
      return 'Topic change'
    case 'action_item':
      return `Action item from ${event.speaker}`
    case 'key_mention':
      return `Key mention: ${event.metadata?.entity || 'details'}`
    case 'decision':
      return `Decision by ${event.speaker}`
    default:
      return 'Insight'
  }
}

function isUserSpeaker(speaker: string): boolean {
  return speaker.toLowerCase() === 'you'
}

export class InsightEngine {
  private detector: HeuristicDetector
  private config: InsightEngineConfig
  private lastEventByType: Map<string, number> = new Map()
  private lastEnrichmentTime = 0
  private enrichmentInProgress = false
  private recentTranscriptEntries: TranscriptEntryLike[] = []

  constructor(config: InsightEngineConfig) {
    this.config = config
    this.detector = new HeuristicDetector()
  }

  private buildTranscriptContext(): string {
    const maxTokens = this.config.maxContextTokens ?? MAX_CONTEXT_TOKENS
    const maxChars = maxTokens * CHARS_PER_TOKEN
    const maxMs = this.config.maxContextMs ?? MAX_CONTEXT_MS
    const cutoff = Date.now() - maxMs

    const lines: string[] = []
    let totalChars = 0
    for (let i = this.recentTranscriptEntries.length - 1; i >= 0 && totalChars < maxChars; i--) {
      const e = this.recentTranscriptEntries[i]
      if (e.startTime < cutoff) break
      const line = `${e.speaker}: ${e.text}`
      lines.unshift(line)
      totalChars += line.length + 1
    }
    return lines.join('\n')
  }

  /** Process a new transcript entry. Call from pipeline callback. */
  onTranscriptEntry(entry: TranscriptEntryLike): void {
    // Update transcript buffer
    this.recentTranscriptEntries.push(entry)
    const maxMs = this.config.maxContextMs ?? MAX_CONTEXT_MS
    const cutoff = Date.now() - maxMs
    this.recentTranscriptEntries = this.recentTranscriptEntries.filter((e) => e.startTime >= cutoff)
    const maxTokens = this.config.maxContextTokens ?? MAX_CONTEXT_TOKENS
    const maxChars = maxTokens * CHARS_PER_TOKEN
    let totalChars = 0
    const trimmed: TranscriptEntryLike[] = []
    for (let i = this.recentTranscriptEntries.length - 1; i >= 0; i--) {
      const e = this.recentTranscriptEntries[i]
      totalChars += `${e.speaker}: ${e.text}`.length + 1
      if (totalChars > maxChars) break
      trimmed.unshift(e)
    }
    this.recentTranscriptEntries = trimmed

    const event = this.detector.detect(entry)
    if (!event) return

    // Skip questions from "You" — only questions from others
    if (event.type === 'question' && isUserSpeaker(event.speaker)) return

    // Deduplicate: same type within debounce window
    const debounceMs = this.config.debounceMs ?? DEFAULT_DEBOUNCE_MS
    const last = this.lastEventByType.get(event.type) ?? 0
    if (Date.now() - last < debounceMs) return
    this.lastEventByType.set(event.type, Date.now())

    void this.emitInsight(event)
  }

  private async emitInsight(event: DetectedEvent): Promise<void> {
    // LLM validation gate for questions: confirm it's a real question
    let eventToEmit = event
    if (event.type === 'question' && this.config.validate) {
      const context = this.buildTranscriptContext()
      const validated = await this.config.validate(event, context)
      if (!validated) return // "na" — discard
      eventToEmit = { ...event, text: validated }
    }
    const enrichmentEnabled =
      this.config.enrichmentEnabled ?? !!this.config.enrich
    const shouldEnrich =
      enrichmentEnabled &&
      this.config.enrich &&
      !this.enrichmentInProgress &&
      Date.now() - this.lastEnrichmentTime > ENRICHMENT_WINDOW_MS

    let title = buildDefaultTitle(eventToEmit)
    let description = eventToEmit.text
    let suggestedActions = buildDefaultActions(eventToEmit)
    let enriched = false

    if (shouldEnrich && this.config.enrich) {
      this.enrichmentInProgress = true
      try {
        const result = await this.config.enrich(eventToEmit)
        if (result) {
          if (result.title) title = result.title
          if (result.description) description = result.description
          if (result.suggestedActions?.length)
            suggestedActions = result.suggestedActions
          enriched = true
        }
      } catch (err) {
        console.error('[insight-engine] Enrichment failed:', err)
      } finally {
        this.enrichmentInProgress = false
        this.lastEnrichmentTime = Date.now()
      }
    }

    const insight: Insight = {
      id: randomUUID(),
      type: eventToEmit.type,
      title,
      description,
      speaker: eventToEmit.speaker,
      timestamp: eventToEmit.timestamp,
      suggestedActions,
      sourceEntryId: eventToEmit.sourceEntryId,
      enriched,
    }

    this.config.sendToRenderer('insight:new', insight)
  }

  /** Update detector config when settings change */
  updateSettings(config: HeuristicDetectorConfig): void {
    this.detector.updateConfig(config)
  }

  /** Reset state when meeting session ends */
  reset(): void {
    this.detector.reset()
    this.recentTranscriptEntries = []
    this.lastEventByType.clear()
    this.enrichmentInProgress = false
  }
}
