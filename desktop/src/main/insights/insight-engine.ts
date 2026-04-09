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
} from './types'
import type { HeuristicDetectorConfig } from './heuristic-detector'
import { HeuristicDetector } from './heuristic-detector'
import { classifyQuestion } from './question-classifier'

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
  /** Transcription language: 'en' = use ML (English-only), 'multi' = skip ML */
  transcriptionLanguage?: 'en' | 'multi'
  /** Web search available (false when using Ollama/LM Studio). Used to hide "Search the web" action. */
  webSearchAvailable?: () => boolean
}

const DEFAULT_DEBOUNCE_MS = 10_000
const ENRICHMENT_WINDOW_MS = 15_000
const MAX_CONTEXT_TOKENS = 500
const MAX_CONTEXT_MS = 3 * 60 * 1000 // 3 minutes
const CHARS_PER_TOKEN = 4 // rough estimate

function buildDefaultActions(
  event: DetectedEvent,
  questionWithContext?: string,
  webSearchAvailable = true,
): InsightAction[] {
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
      if (webSearchAvailable) {
        actions.push({
          id: randomUUID(),
          label: 'Search the web',
          type: 'search',
          payload: contextQ,
          icon: 'search',
        })
      }
      actions.push({
        id: randomUUID(),
        label: 'Suggest follow-up questions',
        type: 'follow_up',
        payload: `Based on the context and transcript, suggest 2-3 follow-up questions for: ${contextQ}`,
        icon: 'chat',
      })
      break
    }
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
    case 'decision':
      return `Decision by ${event.speaker}`
    default:
      return 'Insight'
  }
}

function isUserSpeaker(speaker: string): boolean {
  return speaker.toLowerCase() === 'you'
}


export type SpeakerFilter = 'you' | 'them' | 'both'

export class InsightEngine {
  private detector: HeuristicDetector
  private config: InsightEngineConfig
  private disabledTypes: Set<DetectedEventType> = new Set()
  private speakerFilter: SpeakerFilter = 'both'
  private lastEventByType: Map<string, number> = new Map()
  private lastEnrichmentTime = 0
  private enrichmentInProgress = false
  private recentTranscriptEntries: TranscriptEntryLike[] = []
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

    if (this.speakerFilter === 'you' && !isUserSpeaker(entry.speaker)) return
    if (this.speakerFilter === 'them' && isUserSpeaker(entry.speaker)) return

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
    const candidates: DetectedEvent[] = this.detector.detectAll(entry)

    if (candidates.length > 0) {
      const types = candidates.map((c) => `${c.type}(${(c.confidence * 100).toFixed(0)}%)`)
      log.debug(`Heuristic hits for "${entry.text.slice(0, 60)}": ${types.join(', ')}`)
    }

    if (candidates.length === 0) return

    const debounceMs = this.config.debounceMs ?? DEFAULT_DEBOUNCE_MS

    const questionCandidates = candidates.filter((c) => c.type === 'question')
    const nonQuestionCandidates = candidates.filter((c) => c.type !== 'question')

    // Emit non-question candidates (decision) directly
    for (const candidate of nonQuestionCandidates) {
      if (!this.disabledTypes.has(candidate.type)) {
        if (this.tryDebounce(candidate.type, debounceMs)) {
          void this.emitInsight(candidate)
        } else {
          log.debug(`${candidate.type} debounced (too recent)`)
        }
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

  private async emitInsight(event: DetectedEvent): Promise<void> {
    // ML gate for gray-zone questions (confidence 0.4–0.7). Only when English — model is English-only.
    const useMlGate =
      (this.config.questionMlEnabled ?? true) &&
      (this.config.transcriptionLanguage ?? 'en') === 'en'
    if (
      event.type === 'question' &&
      useMlGate &&
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
    const webSearchOk = this.config.webSearchAvailable?.() ?? true
    const suggestedActions = buildDefaultActions(eventToEmit, questionWithContext, webSearchOk)

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
            this.config.sendToRenderer('insight:update', {
              id: insight.id,
              title: result.title,
              description: result.description,
              suggestedActions: result.suggestedActions,
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
  updateSettings(config: HeuristicDetectorConfig & {
    questionMlEnabled?: boolean
    speakerFilter?: SpeakerFilter
    enrichmentEnabled?: boolean
    transcriptionLanguage?: 'en' | 'multi'
  }): void {
    this.detector.updateConfig(config)
    if (config.disabledTypes) this.disabledTypes = config.disabledTypes
    if (typeof config.questionMlEnabled === 'boolean') {
      this.config.questionMlEnabled = config.questionMlEnabled
    }
    if (config.speakerFilter) {
      this.speakerFilter = config.speakerFilter
    }
    if (typeof config.enrichmentEnabled === 'boolean') {
      this.config.enrichmentEnabled = config.enrichmentEnabled
    }
    if (config.transcriptionLanguage !== undefined) {
      this.config.transcriptionLanguage = config.transcriptionLanguage
    }
  }

  /** Reset state when meeting session ends */
  reset(): void {
    this.detector.reset()
    this.recentTranscriptEntries = []
    this.processQueue = []
    this.lastEventByType.clear()
    this.enrichmentInProgress = false
  }
}
