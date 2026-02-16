/**
 * Heuristic detector for live meeting insights.
 * Runs synchronously on each transcript entry — zero-cost pattern matching.
 */

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
const QUESTION_WORDS =
  /\b(who|what|when|where|why|how|which|whose|whom)\b/i
const QUESTION_VERBS = /\b(can|could|would|should|do|does|did|is|are|was|were|has|have|had|will|shall)\s+\w+/i
const QUESTION_END = /\?$/

function detectQuestion(
  entry: TranscriptEntryLike,
  extraQuestionKeywords: string[] = [],
): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 5) return null

  let confidence = 0
  if (QUESTION_END.test(text)) confidence += 0.5
  if (QUESTION_WORDS.test(text)) confidence += 0.35
  if (QUESTION_VERBS.test(text)) confidence += 0.2
  if (extraQuestionKeywords.length > 0) {
    const lower = text.toLowerCase()
    for (const kw of extraQuestionKeywords) {
      if (kw && lower.includes(kw.toLowerCase())) {
        confidence += 0.3
        break
      }
    }
  }

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

// ── Topic change detection ─────────────────────────────────
const JACCARD_THRESHOLD = 0.15
const MIN_ENTRIES_FOR_TOPIC = 3

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  const inter = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 1 : inter / union
}

function detectTopicChange(
  entry: TranscriptEntryLike,
  recentEntries: TranscriptEntryLike[],
): DetectedEvent | null {
  if (recentEntries.length < MIN_ENTRIES_FOR_TOPIC) return null

  const recentText = recentEntries.map((e) => e.text).join(' ')
  const recentTokens = tokenize(recentText)
  const newTokens = tokenize(entry.text)

  if (newTokens.size === 0) return null

  const similarity = jaccard(recentTokens, newTokens)
  if (similarity > JACCARD_THRESHOLD) return null

  return {
    type: 'topic_change',
    confidence: 0.6,
    sourceEntryId: entry.id,
    speaker: entry.speaker,
    text: entry.text,
    timestamp: entry.startTime,
  }
}

// ── Action item detection ──────────────────────────────────
const ACTION_PHRASES = [
  /\blet's\b/i,
  /\bwe should\b/i,
  /\bI'll\b/i,
  /\byou need to\b/i,
  /\bcan you\b/i,
  /\bmake sure to\b/i,
  /\bfollow up on\b/i,
  /\bfollow up with\b/i,
  /\bplease\s+\w+/i,
  /\bwe need to\b/i,
  /\bsend (me|them|us)\b/i,
  /\bschedule\s+(a|an)\b/i,
  /\bset up\s+(a|an)\b/i,
]

function detectActionItem(entry: TranscriptEntryLike): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 8) return null

  for (const re of ACTION_PHRASES) {
    if (re.test(text)) {
      return {
        type: 'action_item',
        confidence: 0.7,
        sourceEntryId: entry.id,
        speaker: entry.speaker,
        text,
        timestamp: entry.startTime,
      }
    }
  }
  return null
}

// ── Key mention detection ───────────────────────────────────
const DOLLAR_AMOUNT = /\$[\d,]+(?:\.\d+)?\s*(?:M|B|K|million|billion|k)?/i
const DATE_PATTERN =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/i
const URL_PATTERN = /https?:\/\/[^\s]+/i
const CAPITALIZED_ENTITY = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/

function detectKeyMention(entry: TranscriptEntryLike): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 4) return null

  const metadata: Record<string, unknown> = {}

  if (DOLLAR_AMOUNT.test(text)) {
    const m = text.match(DOLLAR_AMOUNT)
    if (m) metadata.amount = m[0]
  }
  if (DATE_PATTERN.test(text)) {
    const m = text.match(DATE_PATTERN)
    if (m) metadata.date = m[0]
  }
  if (URL_PATTERN.test(text)) {
    const m = text.match(URL_PATTERN)
    if (m) metadata.url = m[0]
  }
  if (CAPITALIZED_ENTITY.test(text)) {
    const m = text.match(CAPITALIZED_ENTITY)
    if (m) metadata.entity = m[0]
  }

  if (Object.keys(metadata).length === 0) return null

  return {
    type: 'key_mention',
    confidence: 0.65,
    sourceEntryId: entry.id,
    speaker: entry.speaker,
    text,
    timestamp: entry.startTime,
    metadata,
  }
}

// ── Decision detection ─────────────────────────────────────
const DECISION_PHRASES = [
  /\bagreed\b/i,
  /\bdecided\b/i,
  /\blet's go with\b/i,
  /\bwe'll do\b/i,
  /\bsounds good\b/i,
  /\bthat works\b/i,
  /\bdeal\b/i,
  /\bconfirmed\b/i,
  /\bwe're going with\b/i,
  /\bthat's the plan\b/i,
]

function detectDecision(entry: TranscriptEntryLike): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 4) return null

  for (const re of DECISION_PHRASES) {
    if (re.test(text)) {
      return {
        type: 'decision',
        confidence: 0.7,
        sourceEntryId: entry.id,
        speaker: entry.speaker,
        text,
        timestamp: entry.startTime,
      }
    }
  }
  return null
}

// ── HeuristicDetector ──────────────────────────────────────

export interface HeuristicDetectorConfig {
  disabledTypes?: Set<DetectedEventType>
  extraQuestionKeywords?: string[]
}

export class HeuristicDetector {
  private recentEntries: TranscriptEntryLike[] = []
  private static readonly RECENT_WINDOW = 5
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
    const disabled = this.config.disabledTypes ?? new Set<DetectedEventType>()
    const extraKeywords = this.config.extraQuestionKeywords ?? []
    const candidates: DetectedEvent[] = []

    if (!disabled.has('question')) {
      const q = detectQuestion(entry, extraKeywords)
      if (q) candidates.push(q)
    }

    if (!disabled.has('topic_change')) {
      const tc = detectTopicChange(entry, this.recentEntries)
      if (tc) candidates.push(tc)
    }

    if (!disabled.has('action_item')) {
      const ai = detectActionItem(entry)
      if (ai) candidates.push(ai)
    }

    if (!disabled.has('key_mention')) {
      const km = detectKeyMention(entry)
      if (km) candidates.push(km)
    }

    if (!disabled.has('decision')) {
      const d = detectDecision(entry)
      if (d) candidates.push(d)
    }

    // Update sliding window
    this.recentEntries.push(entry)
    if (this.recentEntries.length > HeuristicDetector.RECENT_WINDOW) {
      this.recentEntries.shift()
    }

    if (candidates.length === 0) return null

    return candidates.reduce((best, c) =>
      c.confidence > best.confidence ? c : best,
    )
  }

  /** Reset state when meeting session ends */
  reset(): void {
    this.recentEntries = []
  }
}
