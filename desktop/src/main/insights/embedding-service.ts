/**
 * Shared embedding service for Live Insights.
 * Loads Xenova/all-MiniLM-L6-v2 once, caches embeddings per transcript entry,
 * and precomputes seed embeddings for action-item similarity.
 * Reused by action_item detection and topic_change detection.
 */

import { createLogger } from '../logger'

const log = createLogger('embedding-service')

export interface CachedEntry {
  embedding: Float32Array
  entryId: string
  text: string
  cachedAt: number
}

const MAX_CACHE_ENTRIES = 50
const CACHE_TTL_MS = 3 * 60 * 1000 // 3 minutes

/** Seed phrases for action-item embedding similarity (20–30 representative phrases) */
const ACTION_ITEM_SEED_PHRASES = [
  "I'll follow up with you",
  "We should schedule a meeting",
  "Can you send me the report",
  "Make sure to follow up on this",
  "Please add it to the agenda",
  "You need to complete this by Friday",
  "Let's schedule a call",
  "We need to touch base next week",
  "Send me the update when you have it",
  "Schedule a review for next Monday",
  "Set up a meeting with the team",
  "Assign this to me",
  "Take away: we need to finalize the budget",
  "Next step is to get approval",
  "Action item: Sarah will send the deck",
  "Remind me to follow up",
  "Circle back on this",
  "I will get back to you",
  "I'm going to send the documents",
  "Don't forget to add it to the list",
  "Add this to the roadmap",
  "Let's follow up on that",
  "We need to send them the proposal",
  "I'll make sure to include that",
  "Please remind us before the deadline",
]

let pipeline: any = null
/** Mutex: only one init at a time to avoid concurrent downloads */
let initPromise: Promise<boolean> | null = null

async function doInit(): Promise<boolean> {
  try {
    log.info('Loading model Xenova/all-MiniLM-L6-v2...')
    const { pipeline: createPipeline } = await import('@huggingface/transformers')
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    })
    log.success('Model loaded successfully')
    return true
  } catch (err) {
    log.error('Init failed:', err)
    return false
  }
}

async function init(): Promise<boolean> {
  if (pipeline) return true
  if (initPromise) return initPromise
  initPromise = doInit()
  const result = await initPromise
  if (!result) initPromise = null
  return result
}

function runEmbedding(text: string): Promise<Float32Array | null> {
  if (!pipeline) return Promise.resolve(null)
  return pipeline(text, { pooling: 'mean', normalize: true }).then((output: any) => {
    if (output && typeof output.data !== 'undefined') {
      return new Float32Array(output.data)
    }
    if (Array.isArray(output) && output[0]) {
      const o = output[0]
      return o.data ? new Float32Array(o.data) : new Float32Array(o)
    }
    return null
  })
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/** Mean of multiple embeddings */
export function meanEmbedding(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length === 0) return new Float32Array(0)
  const dim = embeddings[0].length
  const mean = new Float32Array(dim)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) mean[i] += emb[i]
  }
  for (let i = 0; i < dim; i++) mean[i] /= embeddings.length
  return mean
}

// ── Cache ────────────────────────────────────────────────────────────────

const cache = new Map<string, CachedEntry>()
const cacheOrder: string[] = [] // for LRU eviction

function evictCache(): void {
  const now = Date.now()
  const cutoff = now - CACHE_TTL_MS

  // Evict by TTL (entries cached more than 3 min ago)
  for (const [id, cached] of cache.entries()) {
    if (cached.cachedAt < cutoff) {
      cache.delete(id)
      const idx = cacheOrder.indexOf(id)
      if (idx >= 0) cacheOrder.splice(idx, 1)
    }
  }

  // Evict by size (LRU)
  while (cache.size > MAX_CACHE_ENTRIES && cacheOrder.length > 0) {
    const oldest = cacheOrder.shift()
    if (oldest) cache.delete(oldest)
  }
}

// ── Seed mean for action items ───────────────────────────────────────────

let seedMean: Float32Array | null = null

async function ensureSeedMean(): Promise<Float32Array | null> {
  if (seedMean) return seedMean
  const ready = await init()
  if (!ready || !pipeline) return null

  try {
    const embeddings: Float32Array[] = []
    for (const phrase of ACTION_ITEM_SEED_PHRASES) {
      const emb = await runEmbedding(phrase)
      if (emb) embeddings.push(emb)
    }
    if (embeddings.length === 0) return null
    seedMean = meanEmbedding(embeddings)
    log.debug('Seed mean computed from', embeddings.length, 'phrases')
    return seedMean
  } catch (err) {
    log.warn('Seed mean computation failed:', err)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Embed text. Returns null if model unavailable or inference fails.
 */
export async function embed(text: string): Promise<Float32Array | null> {
  const ready = await init()
  if (!ready || !pipeline) return null

  const t = text.trim()
  if (t.length === 0) return null

  try {
    return await runEmbedding(t)
  } catch (err) {
    log.warn('Embed failed:', err)
    return null
  }
}

/**
 * Get embedding for a transcript entry, using cache when available.
 * Caches by entryId for reuse by action_item and topic_change detectors.
 */
export async function getOrEmbed(entryId: string, text: string): Promise<Float32Array | null> {
  const cached = cache.get(entryId)
  if (cached) return cached.embedding

  const embedding = await embed(text)
  if (!embedding) return null

  evictCache()
  cache.set(entryId, {
    embedding,
    entryId,
    text,
    cachedAt: Date.now(),
  })
  cacheOrder.push(entryId)
  return embedding
}

/**
 * Get the precomputed mean embedding of action-item seed phrases.
 * Used for action_item detection: sim(entry, seedMean) > 0.55.
 */
export async function getActionItemSeedMean(): Promise<Float32Array | null> {
  return ensureSeedMean()
}

/**
 * Check if an entry's embedding is similar enough to action-item seed phrases.
 * Returns similarity score (0–1) or null if unavailable.
 */
export async function actionItemSimilarity(embedding: Float32Array): Promise<number | null> {
  const mean = await getActionItemSeedMean()
  if (!mean) return null
  return cosineSimilarity(embedding, mean)
}

/**
 * Get cached embedding for an entry ID, if present.
 */
export function getCached(entryId: string): Float32Array | null {
  return cache.get(entryId)?.embedding ?? null
}

/**
 * Get recent cached entries for topic-change comparison.
 */
export function getRecentCached(entryIds: string[]): Array<{ id: string; embedding: Float32Array }> {
  const result: Array<{ id: string; embedding: Float32Array }> = []
  for (const id of entryIds) {
    const cached = cache.get(id)
    if (cached) result.push({ id, embedding: cached.embedding })
  }
  return result
}

/**
 * Clear cache (e.g. when meeting session ends).
 */
export function clearCache(): void {
  cache.clear()
  cacheOrder.length = 0
}
