/**
 * Shared types for the Live Insights feature.
 * Used by HeuristicDetector, InsightEngine, and mirrored in renderer.
 */

export type DetectedEventType =
  | 'question'
  | 'decision'

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

