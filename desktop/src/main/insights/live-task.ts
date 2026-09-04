import { randomUUID } from 'crypto'
import type { TranscriptEntryLike } from './insight-engine'
import type { Insight } from './types'

export interface LiveTaskResult {
  text: string
  /** Verbatim document line the note belongs after; null = append at end */
  after: string | null
}

/**
 * Runs the user's standing "live task" prompt on a cadence against the
 * transcript lines that arrived since the last run. Results become insight
 * cards and, when enabled, get written into the live doc.
 * No task configured → no LLM calls.
 */
export function createLiveTaskRunner(opts: {
  getTask: () => string
  getIntervalMs: () => number
  run: (task: string, transcriptDelta: string) => Promise<LiveTaskResult | null>
  emit: (insight: Insight) => void
  write?: (text: string, after: string | null) => void
}) {
  let buffer: TranscriptEntryLike[] = []
  let timer: NodeJS.Timeout | null = null
  let busy = false

  async function tick(): Promise<void> {
    const task = opts.getTask().trim()
    if (!task) {
      buffer = []
      return
    }
    if (busy || buffer.length === 0) return
    const entries = buffer
    buffer = []
    busy = true
    try {
      const delta = entries.map((e) => `[${fmt(e.startTime)}] ${e.speaker}: ${e.text}`).join('\n')
      const result = await opts.run(task, delta)
      if (!result) return
      opts.emit({
        id: randomUUID(),
        type: 'task',
        title: task.length > 40 ? `${task.slice(0, 37)}…` : task,
        description: result.text,
        speaker: 'agent',
        timestamp: Date.now(),
        suggestedActions: [],
        sourceEntryId: entries[entries.length - 1].id,
        enriched: true,
      })
      opts.write?.(result.text, result.after)
    } finally {
      busy = false
    }
  }

  // setTimeout chain so an interval change in settings applies on the next tick
  function schedule(): void {
    timer = setTimeout(async () => {
      await tick()
      if (timer) schedule()
    }, opts.getIntervalMs())
  }

  return {
    push(entry: TranscriptEntryLike): void {
      if (timer) buffer.push(entry)
    },
    start(): void {
      if (!timer) schedule()
    },
    stop(): void {
      if (timer) clearTimeout(timer)
      timer = null
      buffer = []
    },
  }
}

function fmt(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
}
