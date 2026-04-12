import { readFile } from 'fs/promises'
import type { BackendClient } from './backend-client'
import { createLogger } from './logger'

const log = createLogger('calendar-meeting-match')

export interface TranscriptMeetingWindow {
  start: Date
  end: Date
}

/**
 * Derive wall-clock [start, end] from a saved Scribely transcript JSON.
 * Uses `createdAt` (save time ≈ meeting end) and `summary.durationMs` / last entry endTime.
 */
export function parseTranscriptMeetingWindow(transcriptJson: string): TranscriptMeetingWindow | null {
  try {
    const data = JSON.parse(transcriptJson) as {
      createdAt?: string
      summary?: { durationMs?: number }
      entries?: Array<{ endTime?: number }>
    }
    const created = data.createdAt ? Date.parse(data.createdAt) : NaN
    if (!Number.isFinite(created)) {
      return null
    }
    let durationMs = data.summary?.durationMs ?? 0
    if (durationMs <= 0 && Array.isArray(data.entries) && data.entries.length > 0) {
      durationMs = Math.max(...data.entries.map((e) => e.endTime ?? 0))
    }
    if (durationMs <= 0) {
      return null
    }
    const end = new Date(created)
    const start = new Date(created - durationMs)
    if (!(start < end)) {
      return null
    }
    return { start, end }
  } catch {
    return null
  }
}

export function pickBestOverlappingCalendarEventId(
  events: Array<{ id: string; start_time: string; end_time: string }>,
  window: TranscriptMeetingWindow,
): string | undefined {
  if (events.length === 0) {
    return undefined
  }
  const ws = window.start.getTime()
  const we = window.end.getTime()
  let bestId: string | undefined
  let bestOverlap = -1
  let bestStartDelta = Infinity
  for (const ev of events) {
    const es = Date.parse(ev.start_time)
    const ee = Date.parse(ev.end_time)
    if (!Number.isFinite(es) || !Number.isFinite(ee)) {
      continue
    }
    const overlap = Math.min(ee, we) - Math.max(es, ws)
    if (overlap <= 0) {
      continue
    }
    const startDelta = Math.abs(es - ws)
    if (overlap > bestOverlap || (overlap === bestOverlap && startDelta < bestStartDelta)) {
      bestOverlap = overlap
      bestStartDelta = startDelta
      bestId = ev.id
    }
  }
  return bestId
}

/**
 * Fetch synced calendar events that overlap the transcript window and return the best match.
 * Returns undefined if nothing matches or the API is unavailable — upload should still proceed.
 */
export async function resolveCalendarEventIdForTranscript(
  backend: BackendClient,
  transcriptFilepath: string,
): Promise<string | undefined> {
  if (!backend.isConfigured) {
    return undefined
  }
  let raw: string
  try {
    raw = await readFile(transcriptFilepath, 'utf-8')
  } catch (e: any) {
    log.warn(`Could not read transcript for calendar match: ${e?.message ?? e}`)
    return undefined
  }
  const win = parseTranscriptMeetingWindow(raw)
  if (!win) {
    return undefined
  }
  try {
    const events = await backend.listOverlappingCalendarEvents(win.start.toISOString(), win.end.toISOString())
    const id = pickBestOverlappingCalendarEventId(events, win)
    if (id) {
      log.info(`Matched calendar event ${id} (window ${win.start.toISOString()} → ${win.end.toISOString()})`)
    }
    return id
  } catch (e: any) {
    log.warn(`Calendar overlap API failed: ${e?.message ?? e}`)
    return undefined
  }
}
