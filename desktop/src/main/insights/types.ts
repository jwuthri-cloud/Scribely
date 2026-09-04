/**
 * Shared types for the Live Insights feature.
 * Used by HeuristicDetector, InsightEngine, and mirrored in renderer.
 */

export type DetectedEventType =
  | 'question'
  | 'topic_change'
  | 'action_item'
  | 'key_mention'
  | 'decision'
  | 'task'

export interface DetectedEvent {
  type: DetectedEventType
  confidence: number
  sourceEntryId: string
  speaker: string
  text: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export type InsightActionType =
  | 'search'
  | 'answer'
  | 'follow_up'
  | 'define'
  | 'summarize'

export interface InsightAction {
  id: string
  label: string
  type: InsightActionType
  payload: string
  icon: string
}

export interface Insight {
  id: string
  type: DetectedEventType
  title: string
  description: string
  speaker: string
  timestamp: number
  suggestedActions: InsightAction[]
  sourceEntryId: string
  enriched: boolean
  /** Self-contained contextual question rewrite (only set for question insights) */
  questionWithContext?: string
}

export interface WebSearchResult {
  content: string
  sources?: Array<{ title: string; url: string }>
  error?: string
}

/** Output from unified LLM validation for non-question insights */
export interface UnifiedInsightEntity {
  type: string
  text: string
  metadata?: Record<string, unknown>
}

export interface UnifiedInsightOutput {
  entities: UnifiedInsightEntity[]
  /** Topic label when utterance starts a new topic; "N/A" when same topic */
  topic: string
  action_item: string | null
  decision: string | null
  key_mention: string | null
}
