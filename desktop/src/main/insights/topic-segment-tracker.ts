/**
 * Topic Segment Tracker: batches transcript entries and periodically generates
 * a topic label for the segment. Used to provide "previous topic" context
 * to validateInsights when detecting topic changes.
 *
 * Topic change detection compares new entries against the SEGMENT embedding
 * (mean of all entries in the 3-5 min window), not the last few entries.
 * This reduces false positives from comparing against a tiny rolling window.
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
  /** First segment: wait this long before generating (default 3 min). Ensures enough context. */
  firstSegmentMinMs?: number
  /** Minimum entries required to generate topic (default 5) */
  minEntriesForTopic?: number
  /** Callback to generate topic from entries. Returns topic string or "N/A" on failure. */
  generateTopic: (entries: TranscriptEntryLike[]) => Promise<string>
  /** Callback to compute mean embedding for segment. Used for topic-change detection. */
  getSegmentMeanEmbedding?: (entries: TranscriptEntryLike[]) => Promise<Float32Array | null>
}

const DEFAULT_SEGMENT_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_FIRST_SEGMENT_MIN_MS = 3 * 60 * 1000 // 3 minutes
const DEFAULT_MIN_ENTRIES = 5

export class TopicSegmentTracker {
  private config: TopicSegmentTrackerConfig
  private segmentEntries: TranscriptEntryLike[] = []
  private currentTopic: string = 'N/A'
  private segmentMeanEmbedding: Float32Array | null = null
  private topicGenerationInProgress = false
  /** After emitting a topic change, use this as baseline until next segment. Avoids repeated triggers. */
  private comparisonBaseline: Float32Array | null = null

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
   * Get the embedding to compare against for topic-change detection.
   * Returns null until first segment is generated (first 3-5 min of meeting).
   */
  getComparisonEmbedding(): Float32Array | null {
    return this.comparisonBaseline ?? this.segmentMeanEmbedding
  }

  /**
   * After emitting a topic change, set the new baseline so we don't keep triggering.
   * Subsequent entries compare against this until the next segment is generated.
   */
  setComparisonBaseline(embedding: Float32Array): void {
    this.comparisonBaseline = embedding
  }

  /**
   * Reset state when meeting session ends.
   */
  reset(): void {
    this.segmentEntries = []
    this.currentTopic = 'N/A'
    this.segmentMeanEmbedding = null
    this.comparisonBaseline = null
    this.topicGenerationInProgress = false
  }

  private maybeTriggerTopicGeneration(): void {
    if (this.topicGenerationInProgress) return

    const segmentDurationMs = this.config.segmentDurationMs ?? DEFAULT_SEGMENT_DURATION_MS
    const firstSegmentMinMs = this.config.firstSegmentMinMs ?? DEFAULT_FIRST_SEGMENT_MIN_MS
    const minEntries = this.config.minEntriesForTopic ?? DEFAULT_MIN_ENTRIES

    if (this.segmentEntries.length < minEntries) return

    const first = this.segmentEntries[0]
    const last = this.segmentEntries[this.segmentEntries.length - 1]
    const spanMs = last!.startTime - first!.startTime

    // First segment: wait at least 3 min. Later segments: 5 min.
    const requiredMs = this.segmentMeanEmbedding === null ? firstSegmentMinMs : segmentDurationMs
    if (spanMs < requiredMs) return

    this.topicGenerationInProgress = true
    const entriesToSummarize = [...this.segmentEntries]
    const getEmbedding = this.config.getSegmentMeanEmbedding

    const topicPromise = this.config.generateTopic(entriesToSummarize)
    const embeddingPromise = getEmbedding
      ? getEmbedding(entriesToSummarize)
      : Promise.resolve(null)

    Promise.all([topicPromise, embeddingPromise])
      .then(([topic, embedding]) => {
        this.currentTopic = topic?.trim() || 'N/A'
        if (embedding) {
          this.segmentMeanEmbedding = embedding
          this.comparisonBaseline = null
        }
        log.info(`[topic-segment] Generated topic: "${this.currentTopic}"`)
      })
      .catch((err) => {
        log.error('[topic-segment] Topic generation failed:', err)
      })
      .finally(() => {
        this.topicGenerationInProgress = false
        this.segmentEntries = []
      })
  }
}
