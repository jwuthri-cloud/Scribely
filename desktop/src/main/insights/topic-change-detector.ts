/**
 * Embedding-based topic change detector.
 * Compares new transcript entry embedding against a segment baseline (mean of 3-5 min
 * of transcript) via cosine similarity. Uses shared embedding-service.
 */

import { createLogger } from '../logger'
import { cosineSimilarity, meanEmbedding } from './embedding-service'

const log = createLogger('topic-change')
import type { DetectedEvent } from './types'

/** Stricter threshold for segment comparison — need to be clearly different from the full segment. */
const SEGMENT_SIMILARITY_THRESHOLD = 0.4
const LEGACY_SIMILARITY_THRESHOLD = 0.5
const MIN_ENTRIES_FOR_TOPIC = 3

export interface TranscriptEntryLike {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  source: string
}

/**
 * Check if the new entry represents a topic change vs a segment baseline.
 * Prefer segmentBaseline (mean of 3-5 min of transcript) — only runs after first segment.
 * Returns DetectedEvent when it's a topic change, null otherwise.
 */
export function checkTopicChangeWithSegment(
  entry: TranscriptEntryLike,
  entryEmbedding: Float32Array,
  segmentBaseline: Float32Array,
): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 10) return null

  const similarity = cosineSimilarity(entryEmbedding, segmentBaseline)
  log.debug(`Topic change (segment): similarity=${similarity.toFixed(3)} (threshold: <${SEGMENT_SIMILARITY_THRESHOLD})`)

  if (similarity >= SEGMENT_SIMILARITY_THRESHOLD) return null

  return {
    type: 'topic_change',
    confidence: 0.6,
    sourceEntryId: entry.id,
    speaker: entry.speaker,
    text: entry.text,
    timestamp: entry.startTime,
  }
}

/**
 * Legacy: check vs recent embeddings (last N entries). Used only when no segment available.
 * Kept for backwards compatibility but topic detection should use segment.
 */
export function checkTopicChangeWithEmbedding(
  entry: TranscriptEntryLike,
  entryEmbedding: Float32Array,
  recentEmbeddings: Float32Array[],
): DetectedEvent | null {
  const text = entry.text.trim()
  if (text.length < 10) return null

  if (recentEmbeddings.length < MIN_ENTRIES_FOR_TOPIC) {
    log.debug(`Not enough recent embeddings (${recentEmbeddings.length}/${MIN_ENTRIES_FOR_TOPIC}) — skipping`)
    return null
  }

  const meanRecent = meanEmbedding(recentEmbeddings)
  const similarity = cosineSimilarity(entryEmbedding, meanRecent)
  log.debug(`Similarity: ${similarity.toFixed(3)} (threshold: <${LEGACY_SIMILARITY_THRESHOLD})`)

  if (similarity >= LEGACY_SIMILARITY_THRESHOLD) return null

  return {
    type: 'topic_change',
    confidence: 0.6,
    sourceEntryId: entry.id,
    speaker: entry.speaker,
    text: entry.text,
    timestamp: entry.startTime,
  }
}
