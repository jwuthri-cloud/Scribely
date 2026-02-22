/**
 * Topic Segment Tracker: batches transcript entries and periodically generates
 * a topic label for the segment. Used to provide "previous topic" context
 * to validateInsights when detecting topic changes.
 */

import { createLogger } from '../logger'

const log = createLogger('topic-segment-tracker')

export interface TranscriptEntryLike {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source: string
}

export interface TopicSegmentTrackerConfig {
  /** Segment duration in ms before generating topic (default 5 min) */
  segmentDurationMs?: number
  /** Minimum entries required to generate topic (default 5) */
  minEntriesForTopic?: number
  /** Callback to generate topic from entries. Returns topic string or "N/A" on failure. */
  generateTopic: (entries: TranscriptEntryLike[]) => Promise<string>
}

const DEFAULT_SEGMENT_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_MIN_ENTRIES = 5

export class TopicSegmentTracker {
  private config: TopicSegmentTrackerConfig
  private segmentEntries: TranscriptEntryLike[] = []
  private currentTopic: string = 'N/A'
  private topicGenerationInProgress = false

  constructor(config: TopicSegmentTrackerConfig) {
    this.config = {
      segmentDurationMs: DEFAULT_SEGMENT_DURATION_MS,
      minEntriesForTopic: DEFAULT_MIN_ENTRIES,
      ...config,
    }
  }

  /**
   * Add a transcript entry. May trigger async topic generation when segment
   * spans >= segmentDurationMs and has >= minEntriesForTopic.
   */
  addEntry(entry: TranscriptEntryLike): void {
    this.segmentEntries.push(entry)
    this.maybeTriggerTopicGeneration()
  }

  /**
   * Get the current/previous topic for validation. Returns "N/A" for first segment.
   */
  getPreviousTopic(): string {
    return this.currentTopic
  }

  /**
   * Reset state when meeting session ends.
   */
  reset(): void {
    this.segmentEntries = []
    this.currentTopic = 'N/A'
    this.topicGenerationInProgress = false
  }

  private maybeTriggerTopicGeneration(): void {
    if (this.topicGenerationInProgress) return

    const segmentDurationMs = this.config.segmentDurationMs ?? DEFAULT_SEGMENT_DURATION_MS
    const minEntries = this.config.minEntriesForTopic ?? DEFAULT_MIN_ENTRIES

    if (this.segmentEntries.length < minEntries) return

    const first = this.segmentEntries[0]
    const last = this.segmentEntries[this.segmentEntries.length - 1]
    const spanMs = last!.startTime - first!.startTime

    if (spanMs < segmentDurationMs) return

    this.topicGenerationInProgress = true
    const entriesToSummarize = [...this.segmentEntries]

    this.config
      .generateTopic(entriesToSummarize)
      .then((topic) => {
        this.currentTopic = topic.trim() || 'N/A'
        log.info(`[topic-segment] Generated topic: "${this.currentTopic}"`)
      })
      .catch((err) => {
        log.error('[topic-segment] Topic generation failed:', err)
        // Keep previous currentTopic (or "N/A")
      })
      .finally(() => {
        this.topicGenerationInProgress = false
        this.segmentEntries = []
      })
  }
}
