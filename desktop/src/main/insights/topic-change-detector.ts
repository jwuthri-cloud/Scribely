/**
 * Embedding-based topic change detector.
 * Compares new transcript entry embedding with recent entry embeddings via cosine similarity.
 * Uses shared embedding-service (no own pipeline). Accepts precomputed embeddings.
 */

import { createLogger } from '../logger'
import { cosineSimilarity, meanEmbedding } from './embedding-service'

const log = createLogger('topic-change')
import type { DetectedEvent } from './types'

const SIMILARITY_THRESHOLD = 0.5
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
 * Check if the new entry represents a topic change vs recent entries.
 * Uses precomputed embeddings from embedding-service (no re-embedding).
 * Returns DetectedEvent when it's a topic change, null otherwise.
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

  log.debug(`Similarity: ${similarity.toFixed(3)} (threshold: <${SIMILARITY_THRESHOLD})`)

  if (similarity >= SIMILARITY_THRESHOLD) return null

  return {
    type: 'topic_change',
    confidence: 0.6,
    sourceEntryId: entry.id,
    speaker: entry.speaker,
    text: entry.text,
    timestamp: entry.startTime,
  }
}
