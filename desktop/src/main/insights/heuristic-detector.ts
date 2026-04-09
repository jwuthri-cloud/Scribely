/**
 * Heuristic detector for live meeting insights.
 * Runs synchronously on each transcript entry — zero-cost pattern matching.
 */

import { createLogger } from '../logger'

const log = createLogger('heuristic')
import { getKeywordsForLanguage } from '../../shared/insight-defaults'
import type { DetectedEvent, DetectedEventType } from './types'

export interface TranscriptEntryLike {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source: string
}

// ── Question detection ────────────────────────────────────
const QUESTION_END = /\?$/

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildQuestionWordsRegex(words: string[]): RegExp {
  if (words.length === 0) return /^\b$/
  const escaped = words.map(escapeRegex).join('|')
  return new RegExp(`\\b(${escaped})\\b`, 'i')
}

function buildQuestionVerbsRegex(verbs: string[]): RegExp {
  if (verbs.length === 0) return /^\b$/
  const escaped = verbs.map(escapeRegex).join('|')
  return new RegExp(`\\b(${escaped})\\s+\\w+`, 'i')
}

function detectQuestion(
  entry: TranscriptEntryLike,
  questionWords: string[],
  questionVerbs: string[],
): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 5) return null

  const wordsRe = buildQuestionWordsRegex(questionWords)
  const verbsRe = buildQuestionVerbsRegex(questionVerbs)

  let confidence = 0
  if (QUESTION_END.test(text)) confidence += 0.5
  if (wordsRe.test(text)) confidence += 0.4
  if (verbsRe.test(text)) confidence += 0.2

  if (confidence < 0.4) return null

  return {
    type: 'question',
    confidence: Math.min(1, confidence),
    sourceEntryId: entry.id,
    speaker: entry.speaker,
    text,
    timestamp: entry.startTime,
  }
}

// ── Decision detection (heuristic keywords) ────────────────
function buildDecisionRegex(keywords: readonly string[]): RegExp {
  if (keywords.length === 0) return /^\b$/
  const escaped = keywords.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(`\\b(${escaped})\\b`, 'i')
}

function detectDecision(
  entry: TranscriptEntryLike,
  decisionKeywords: readonly string[],
): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 6) return null

  const re = buildDecisionRegex(decisionKeywords)
  if (!re.test(text)) return null

  return {
    type: 'decision',
    confidence: 0.6,
    sourceEntryId: entry.id,
    speaker: entry.speaker,
    text,
    timestamp: entry.startTime,
  }
}

// ── HeuristicDetector ──────────────────────────────────────

export interface HeuristicDetectorConfig {
  disabledTypes?: Set<DetectedEventType>
  /** Transcription language: 'en' = English keywords only, 'multi' = all 6 languages */
  transcriptionLanguage?: 'en' | 'multi'
  /** User-added question words (merged with defaults at runtime) */
  extraQuestionWords?: string[]
  /** User-added question verbs (merged with defaults at runtime) */
  extraQuestionVerbs?: string[]
}

export class HeuristicDetector {
  private config: HeuristicDetectorConfig = {}

  constructor(config: HeuristicDetectorConfig = {}) {
    this.config = { ...config }
  }

  /** Update config for live settings changes */
  updateConfig(config: HeuristicDetectorConfig): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Run all detectors on a new transcript entry.
   * Returns the highest-confidence detected event, or null.
   */
  detect(entry: TranscriptEntryLike): DetectedEvent | null {
    const all = this.detectAll(entry)
    if (all.length === 0) return null
    return all.reduce((best, c) =>
      c.confidence > best.confidence ? c : best,
    )
  }

  /**
   * Run all detectors and return all matching events (for unified LLM validation).
   */
  detectAll(entry: TranscriptEntryLike): DetectedEvent[] {
    const disabled = this.config.disabledTypes ?? new Set<DetectedEventType>()
    const lang = this.config.transcriptionLanguage ?? 'en'
    const { questionWords: baseWords, questionVerbs: baseVerbs, decisionKeywords } = getKeywordsForLanguage(lang)
    const questionWords = [...baseWords, ...(this.config.extraQuestionWords ?? [])]
    const questionVerbs = [...baseVerbs, ...(this.config.extraQuestionVerbs ?? [])]
    const candidates: DetectedEvent[] = []

    if (!disabled.has('question')) {
      const q = detectQuestion(entry, questionWords, questionVerbs)
      if (q) candidates.push(q)
    } else {
      log.debug('question detection disabled')
    }

    if (!disabled.has('decision')) {
      const d = detectDecision(entry, decisionKeywords)
      if (d) candidates.push(d)
    }

    return candidates
  }

  /** Reset state when meeting session ends */
  reset(): void {}
}
