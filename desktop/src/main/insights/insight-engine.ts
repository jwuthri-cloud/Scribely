/**
 * Insight Engine: orchestrates heuristic detection, optional LLM enrichment,
 * deduplication, and IPC emission for Live Insights.
 */

import { randomUUID } from 'crypto'
import { createLogger } from '../logger'

const log = createLogger('insight-engine')
import type {
  DetectedEvent,
  DetectedEventType,
  Insight,
  InsightAction,
  UnifiedInsightOutput,
} from './types'
import type { HeuristicDetectorConfig } from './heuristic-detector'
import { HeuristicDetector } from './heuristic-detector'
import { classifyQuestion } from './question-classifier'
import { checkTopicChangeWithEmbedding } from './topic-change-detector'
import {
  actionItemSimilarity,
  getOrEmbed,
  clearCache,
} from './embedding-service'

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
  /** Optional: validate question events via LLM. Returns raw + contextual question, or null if "na". */
  validate?: (event: DetectedEvent, transcriptContext: string) => Promise<{ question: string; questionWithContext: string } | null>
  /** Optional: unified LLM validation for non-question insights. Returns structured output or null. */
  validateInsights?: (
    transcriptDelta: string,
    entry: TranscriptEntryLike,
    triggeredTypes: DetectedEventType[],
  ) => Promise<UnifiedInsightOutput | null>
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
  /** Enable ML gate for gray-zone questions (default: true) */
  questionMlEnabled?: boolean
}

const DEFAULT_DEBOUNCE_MS = 10_000
const ENRICHMENT_WINDOW_MS = 15_000
const MAX_CONTEXT_TOKENS = 500
const MAX_CONTEXT_MS = 3 * 60 * 1000 // 3 minutes
const CHARS_PER_TOKEN = 4 // rough estimate

function buildDefaultActions(event: DetectedEvent, questionWithContext?: string): InsightAction[] {
  const actions: InsightAction[] = []

  switch (event.type) {
    case 'question': {
      const contextQ = questionWithContext || event.text
      actions.push({
        id: randomUUID(),
        label: 'Answer now',
        type: 'answer',
        payload: contextQ,
        icon: 'sparkle',
      })
      actions.push({
        id: randomUUID(),
        label: 'Search the web',
        type: 'search',
        payload: contextQ,
        icon: 'search',
      })
      actions.push({
        id: randomUUID(),
        label: 'Suggest follow-up questions',
        type: 'follow_up',
        payload: `Suggest 2-3 follow-up questions for: ${contextQ}`,
        icon: 'chat',
      })
      break
    }
    case 'key_mention': {
      const searchQuery =
        event.metadata?.entity && typeof event.metadata.entity === 'string'
          ? `${event.metadata.entity} ${event.metadata.amount || ''}`.trim()
          : event.text
      actions.push({
        id: randomUUID(),
        label: 'Answer now',
        type: 'answer',
        payload: `Tell me more about: ${event.text}`,
        icon: 'sparkle',
      })
      if (event.metadata?.entity || event.metadata?.amount) {
        actions.push({
          id: randomUUID(),
          label: 'Search the web',
          type: 'search',
          payload: searchQuery,
          icon: 'search',
        })
      }
      break
    }
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

const TOPIC_CHANGE_RECENT_WINDOW = 5
const ACTION_ITEM_SIM_THRESHOLD = 0.55

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function formatTranscriptDelta(entries: TranscriptEntryLike[]): string {
  return entries
    .map((e) => `[${formatTimestamp(e.startTime)}] ${e.speaker}: ${e.text}`)
    .join('\n')
}

export class InsightEngine {
  private detector: HeuristicDetector
  private config: InsightEngineConfig
  private disabledTypes: Set<DetectedEventType> = new Set()
  private lastEventByType: Map<string, number> = new Map()
  private lastEnrichmentTime = 0
  private enrichmentInProgress = false
  private recentTranscriptEntries: TranscriptEntryLike[] = []
  private lastSentEntryIds: Set<string> = new Set()
  /** Rolling buffer of last N embeddings for topic-change (avoids re-embedding) */
  private recentEmbeddingBuffer: Array<{ entryId: string; embedding: Float32Array }> = []
  private processQueue: TranscriptEntryLike[] = []
  private processQueueRunning = false

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
    log.debug(`New entry: [${entry.speaker}] "${entry.text.slice(0, 80)}"`)
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

    this.processQueue.push(entry)
    void this.drainProcessQueue()
  }

  private async drainProcessQueue(): Promise<void> {
    if (this.processQueueRunning || this.processQueue.length === 0) return
    this.processQueueRunning = true
    while (this.processQueue.length > 0) {
      const entry = this.processQueue.shift()!
      await this.processEntryAsync(entry)
    }
    this.processQueueRunning = false
  }

  private async processEntryAsync(entry: TranscriptEntryLike): Promise<void> {
    const candidates: DetectedEvent[] = []

    // Sync heuristics: collect all (question, key_mention, decision)
    const syncCandidates = this.detector.detectAll(entry)
    candidates.push(...syncCandidates)

    if (syncCandidates.length > 0) {
      const types = syncCandidates.map((c) => `${c.type}(${(c.confidence * 100).toFixed(0)}%)`)
      log.debug(`Heuristic hits for "${entry.text.slice(0, 60)}": ${types.join(', ')}`)
    }

    // Embed once, reuse for action_item and topic_change
    const embedding = await getOrEmbed(entry.id, entry.text)

    if (embedding) {
      // Action item: embedding similarity vs seed phrases
      if (!this.disabledTypes.has('action_item')) {
        const sim = await actionItemSimilarity(embedding)
        if (sim !== null) {
          if (sim > ACTION_ITEM_SIM_THRESHOLD) {
            log.debug(`Action item candidate: sim=${sim.toFixed(3)} > ${ACTION_ITEM_SIM_THRESHOLD} — "${entry.text.slice(0, 60)}"`)
            candidates.push({
              type: 'action_item',
              confidence: 0.7,
              sourceEntryId: entry.id,
              speaker: entry.speaker,
              text: entry.text.trim(),
              timestamp: entry.startTime,
            })
          }
        }
      }

      // Topic change: embedding similarity vs recent mean (from rolling buffer)
      if (!this.disabledTypes.has('topic_change')) {
        const recentEmbeddings = this.recentEmbeddingBuffer.map((b) => b.embedding)
        const topicEvent = checkTopicChangeWithEmbedding(entry, embedding, recentEmbeddings)
        if (topicEvent) {
          log.debug(`Topic change candidate: "${entry.text.slice(0, 60)}"`)
          candidates.push(topicEvent)
        }
      }

      // Push current embedding to rolling buffer for next entry's topic-change check
      this.recentEmbeddingBuffer.push({ entryId: entry.id, embedding })
      if (this.recentEmbeddingBuffer.length > TOPIC_CHANGE_RECENT_WINDOW) {
        this.recentEmbeddingBuffer.shift()
      }
    } else {
      log.debug('Embedding unavailable — skipping action_item/topic_change detection')
    }

    if (candidates.length === 0) {
      return
    }

    const nonQuestionCandidates = candidates.filter((c) => c.type !== 'question')
    const questionCandidates = candidates.filter((c) => c.type === 'question')

    const debounceMs = this.config.debounceMs ?? DEFAULT_DEBOUNCE_MS

    // Unified LLM validation for non-question insights
    if (
      nonQuestionCandidates.length > 0 &&
      this.config.validateInsights
    ) {
      const triggeredTypes = [...new Set(nonQuestionCandidates.map((c) => c.type))]
      const deltaEntries = this.recentTranscriptEntries.filter((e) => !this.lastSentEntryIds.has(e.id))
      const isFirstCall = this.lastSentEntryIds.size === 0
      const header = isFirstCall ? 'MEETING TRANSCRIPT:' : 'NEW TRANSCRIPT SINCE LAST MESSAGE:'
      const transcriptText = formatTranscriptDelta(deltaEntries)
      const transcriptDelta =
        transcriptText.length > 0
          ? `${header}\n${transcriptText}`
          : header

      log.debug(`LLM validateInsights call — types: [${triggeredTypes.join(', ')}], delta entries: ${deltaEntries.length}`)

      try {
        const result = await this.config.validateInsights(
          transcriptDelta,
          entry,
          triggeredTypes as DetectedEventType[],
        )

        if (result) {
          log.debug(`LLM result — topic: "${result.topic}", action_item: ${result.action_item ? '"' + result.action_item.slice(0, 40) + '"' : 'null'}, decision: ${result.decision ? '"' + result.decision.slice(0, 40) + '"' : 'null'}, key_mention: ${result.key_mention ? '"' + result.key_mention.slice(0, 40) + '"' : 'null'}`)
          this.lastSentEntryIds = new Set(this.recentTranscriptEntries.map((e) => e.id))

          // Emit validated insights for each non-null modality
          if (result.action_item) {
            if (this.tryDebounce('action_item', debounceMs)) {
              void this.emitInsightFromUnified('action_item', result.action_item, entry)
            } else {
              log.debug('action_item debounced (too recent)')
            }
          }
          if (result.topic !== 'N/A' && result.topic.trim()) {
            if (this.tryDebounce('topic_change', debounceMs)) {
              void this.emitInsightFromUnified('topic_change', result.topic.trim(), entry)
            } else {
              log.debug('topic_change debounced (too recent)')
            }
          }
          if (result.key_mention) {
            if (this.tryDebounce('key_mention', debounceMs)) {
              const metadata: Record<string, unknown> = {}
              for (const e of result.entities) {
                if (e.type === 'person' || e.type === 'org' || e.type === 'place') {
                  metadata.entity = e.text
                  break
                }
              }
              const amount = result.entities.find((e) => e.type === 'amount')
              if (amount) metadata.amount = amount.text
              void this.emitInsightFromUnified(
                'key_mention',
                result.key_mention,
                entry,
                Object.keys(metadata).length > 0 ? metadata : undefined,
              )
            } else {
              log.debug('key_mention debounced (too recent)')
            }
          }
          if (result.decision) {
            if (this.tryDebounce('decision', debounceMs)) {
              void this.emitInsightFromUnified('decision', result.decision, entry)
            } else {
              log.debug('decision debounced (too recent)')
            }
          }
        } else {
          log.debug('LLM validateInsights returned null — no insights emitted')
        }
      } catch (err) {
        log.error('LLM validateInsights error:', err)
      }
    } else if (nonQuestionCandidates.length > 0 && !this.config.validateInsights) {
      // Fallback: no unified validation — emit best non-question candidate directly
      const best = nonQuestionCandidates.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      )
      log.debug(`No LLM validator — emitting best non-question directly: ${best.type}`)
      if (this.tryDebounce(best.type, debounceMs)) {
        void this.emitInsight(best)
      }
    }

    // Question flow: separate validation
    if (questionCandidates.length > 0) {
      const questionEvent = questionCandidates.reduce((best, c) =>
        c.confidence > best.confidence ? c : best,
      )
      if (this.tryDebounce('question', debounceMs)) {
        log.info(`Question detected (${questionEvent.speaker}, conf=${(questionEvent.confidence * 100).toFixed(0)}%): "${questionEvent.text.slice(0, 60)}"`)
        void this.emitInsight(questionEvent)
      } else {
        log.debug('Question debounced (too recent)')
      }
    }
  }

  private tryDebounce(type: string, debounceMs: number): boolean {
    const last = this.lastEventByType.get(type) ?? 0
    if (Date.now() - last < debounceMs) return false
    this.lastEventByType.set(type, Date.now())
    return true
  }

  private async emitInsightFromUnified(
    type: DetectedEventType,
    text: string,
    entry: TranscriptEntryLike,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const event: DetectedEvent = {
      type,
      confidence: 0.8,
      sourceEntryId: entry.id,
      speaker: entry.speaker,
      text,
      timestamp: entry.startTime,
      ...(metadata && { metadata }),
    }
    await this.emitInsight(event)
  }

  private async emitInsight(event: DetectedEvent): Promise<void> {
    // ML gate for gray-zone questions (confidence 0.4–0.7)
    if (
      event.type === 'question' &&
      (this.config.questionMlEnabled ?? true) &&
      event.confidence >= 0.4 &&
      event.confidence < 0.7
    ) {
      log.debug(`ML gate: classifying gray-zone question (conf=${(event.confidence * 100).toFixed(0)}%): "${event.text.slice(0, 60)}"`)
      const mlResult = await classifyQuestion(event.text)
      log.debug(`ML gate result: ${mlResult === null ? 'unavailable (skip gate)' : mlResult ? 'IS question' : 'NOT question — dropping'}`)
      if (mlResult === false) return
    }

    // LLM validation gate for questions: confirm it's a real question
    let eventToEmit = event
    let questionWithContext: string | undefined
    if (event.type === 'question' && this.config.validate) {
      log.debug(`LLM question validation: "${event.text.slice(0, 60)}"`)
      const context = this.buildTranscriptContext()
      const validated = await this.config.validate(event, context)
      if (!validated) {
        log.debug('LLM says NOT a real question — dropping')
        return
      }
      log.info(`LLM confirmed question: "${validated.question.slice(0, 60)}" | context: "${validated.questionWithContext.slice(0, 60)}"`)
      eventToEmit = { ...event, text: validated.question }
      questionWithContext = validated.questionWithContext
    }
    const title = buildDefaultTitle(eventToEmit)
    const description = eventToEmit.text
    const suggestedActions = buildDefaultActions(eventToEmit, questionWithContext)

    const insight: Insight = {
      id: randomUUID(),
      type: eventToEmit.type,
      title,
      description: questionWithContext || description,
      speaker: eventToEmit.speaker,
      timestamp: eventToEmit.timestamp,
      suggestedActions,
      sourceEntryId: eventToEmit.sourceEntryId,
      enriched: false,
      ...(questionWithContext && { questionWithContext }),
    }

    log.success(`EMITTING insight: type=${insight.type}, title="${insight.title}"`)
    this.config.sendToRenderer('insight:new', insight)

    // Enrich in background — don't block real-time display
    const enrichmentEnabled =
      this.config.enrichmentEnabled ?? !!this.config.enrich
    const shouldEnrich =
      enrichmentEnabled &&
      this.config.enrich &&
      !this.enrichmentInProgress &&
      Date.now() - this.lastEnrichmentTime > ENRICHMENT_WINDOW_MS

    if (shouldEnrich && this.config.enrich) {
      this.enrichmentInProgress = true
      void this.config
        .enrich(eventToEmit)
        .then((result) => {
          if (result && (result.title || result.description || result.suggestedActions?.length)) {
            let actions = result.suggestedActions
            if (actions?.length && eventToEmit.type === 'key_mention') {
              const hasAnswer = actions.some((a) => a.type === 'answer')
              if (!hasAnswer) {
                actions = [
                  {
                    id: randomUUID(),
                    label: 'Answer now',
                    type: 'answer',
                    payload: `Tell me more about: ${eventToEmit.text}`,
                    icon: 'sparkle',
                  },
                  ...actions,
                ]
              }
            }
            this.config.sendToRenderer('insight:update', {
              id: insight.id,
              title: result.title,
              description: result.description,
              suggestedActions: actions,
            })
          }
        })
        .catch((err) => log.error('Enrichment failed:', err))
        .finally(() => {
          this.enrichmentInProgress = false
          this.lastEnrichmentTime = Date.now()
        })
    }
  }

  /** Update detector config and engine options when settings change */
  updateSettings(config: HeuristicDetectorConfig & { questionMlEnabled?: boolean }): void {
    this.detector.updateConfig(config)
    if (config.disabledTypes) this.disabledTypes = config.disabledTypes
    if (typeof config.questionMlEnabled === 'boolean') {
      this.config.questionMlEnabled = config.questionMlEnabled
    }
  }

  /** Reset state when meeting session ends */
  reset(): void {
    this.detector.reset()
    this.recentTranscriptEntries = []
    this.recentEmbeddingBuffer = []
    this.processQueue = []
    this.lastSentEntryIds.clear()
    this.lastEventByType.clear()
    this.enrichmentInProgress = false
    clearCache()
  }
}
