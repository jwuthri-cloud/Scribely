/**
 * Normalizes transcript JSON from GET /meetings/{id}/transcript (EnrichedTranscriptResponse.transcript).
 * Handles desktop JSON (entries with startTime/endTime in ms), enriched diarization utterances (startMs),
 * and legacy timestamp fields.
 */

export interface NormalizedTranscriptEntry {
  id: string
  speaker: string
  text: string
  /** Start time in seconds for display / sorting */
  startSeconds: number | null
  endSeconds: number | null
}

export interface NormalizedTranscript {
  entries: NormalizedTranscriptEntry[]
  /** From transcript.summary or diarization meta */
  summary: {
    totalEntries?: number
    speakers?: string[]
    durationMs?: number
  }
  createdAt: string | null
  version: number | null
  /** True when rows came from diarization.utterances */
  fromDiarization: boolean
}

type LooseRecord = Record<string, unknown>

function asRecord(v: unknown): LooseRecord | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as LooseRecord) : null
}

/** Desktop startTime/endTime are ms from session start */
function msToSeconds(ms: number): number {
  return ms / 1000
}

/**
 * Heuristic: values from Whisper/desktop are ms if typically > 500 (0.5s in ms).
 * Legacy `timestamp` in seconds is usually small at meeting start — prefer explicit fields.
 */
function inferSecondsFromStartField(
  v: number,
  field: "startMs" | "startTime" | "timestamp"
): number {
  if (field === "startMs") return msToSeconds(v)
  if (field === "startTime") return msToSeconds(v)
  if (v > 1_000_000) return v / 1000
  return v
}

function pickStartSeconds(entry: LooseRecord): number | null {
  if (typeof entry.startMs === "number") return inferSecondsFromStartField(entry.startMs, "startMs")
  if (typeof entry.startTime === "number")
    return inferSecondsFromStartField(entry.startTime, "startTime")
  if (typeof entry.timestamp === "number")
    return inferSecondsFromStartField(entry.timestamp, "timestamp")
  return null
}

function pickEndSeconds(entry: LooseRecord): number | null {
  if (typeof entry.endMs === "number") return msToSeconds(entry.endMs)
  if (typeof entry.endTime === "number") return msToSeconds(entry.endTime)
  return null
}

function pickSpeaker(entry: LooseRecord): string {
  const s = entry.speaker ?? entry.label ?? entry.originalLabel
  return typeof s === "string" && s.trim() ? s.trim() : "Speaker"
}

function pickText(entry: LooseRecord): string {
  const t = entry.text ?? entry.content
  return typeof t === "string" ? t : ""
}

function pickId(entry: LooseRecord, index: number): string {
  const id = entry.id
  return typeof id === "string" && id ? id : `entry-${index}`
}

function normalizeEntryArray(raw: unknown[]): NormalizedTranscriptEntry[] {
  return raw.map((item, index) => {
    const e = asRecord(item) ?? {}
    const startSeconds = pickStartSeconds(e)
    const endSeconds = pickEndSeconds(e)
    return {
      id: pickId(e, index),
      speaker: pickSpeaker(e),
      text: pickText(e),
      startSeconds,
      endSeconds,
    }
  })
}

// strip accidental field
export function normalizeTranscriptBlob(transcript: unknown): NormalizedTranscript {
  const root = asRecord(transcript)
  if (!root) {
    return {
      entries: [],
      summary: {},
      createdAt: null,
      version: null,
      fromDiarization: false,
    }
  }

  const diar = asRecord(root.diarization)
  const utterances = diar?.utterances
  if (Array.isArray(utterances) && utterances.length > 0) {
    const entries = normalizeEntryArray(utterances)
    const summaryRaw = asRecord(root.summary) ?? {}
    const durationMs =
      typeof summaryRaw.durationMs === "number"
        ? summaryRaw.durationMs
        : entries.length
          ? Math.max(
              0,
              ...entries.map((x) =>
                x.endSeconds != null ? x.endSeconds * 1000 : (x.startSeconds ?? 0) * 1000
              )
            )
          : undefined
    return {
      entries,
      summary: {
        totalEntries: entries.length,
        speakers:
          diar != null && Array.isArray(diar.speakers)
            ? (diar.speakers as string[])
            : Array.from(new Set(entries.map((e) => e.speaker))),
        durationMs,
      },
      createdAt: typeof root.createdAt === "string" ? root.createdAt : null,
      version: typeof root.version === "number" ? root.version : null,
      fromDiarization: true,
    }
  }

  const entriesRaw = root.entries
  const list = Array.isArray(entriesRaw)
    ? entriesRaw
    : Array.isArray(transcript)
      ? (transcript as unknown[])
      : []

  const entries = normalizeEntryArray(list)
  const summaryRaw = asRecord(root.summary) ?? {}

  const durationMs =
    typeof summaryRaw.durationMs === "number" ? summaryRaw.durationMs : undefined

  return {
    entries,
    summary: {
      totalEntries:
        typeof summaryRaw.totalEntries === "number" ? summaryRaw.totalEntries : entries.length,
      speakers: Array.isArray(summaryRaw.speakers)
        ? (summaryRaw.speakers as string[])
        : Array.from(new Set(entries.map((e) => e.speaker))),
      durationMs,
    },
    createdAt: typeof root.createdAt === "string" ? root.createdAt : null,
    version: typeof root.version === "number" ? root.version : null,
    fromDiarization: false,
  }
}

export function formatTranscriptTimestamp(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

/** Stable index 0..7 from speaker name for badge colors */
export function speakerColorIndex(speaker: string): number {
  let h = 0
  for (let i = 0; i < speaker.length; i++) h = (h * 31 + speaker.charCodeAt(i)) >>> 0
  return h % 8
}

/** Merge consecutive lines from the same speaker (conversation / bubble view). */
export function groupConsecutiveSpeakerBlocks(
  entries: NormalizedTranscriptEntry[]
): { speaker: string; lines: NormalizedTranscriptEntry[] }[] {
  const out: { speaker: string; lines: NormalizedTranscriptEntry[] }[] = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (last && last.speaker === e.speaker) {
      last.lines.push(e)
    } else {
      out.push({ speaker: e.speaker, lines: [e] })
    }
  }
  return out
}
