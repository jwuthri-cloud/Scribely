import type { MeetingDetail } from "@/lib/api"
import type { NormalizedTranscript } from "@/lib/meeting-transcript"
import { formatTranscriptTimestamp } from "@/lib/meeting-transcript"
import { formatDurationSeconds } from "@/lib/utils"

export interface MeetingExportDocument {
  meetingId: string
  title: string
  recordedAtLabel: string | null
  durationSec: number | null
  summary: MeetingDetail | null
  normalized: NormalizedTranscript
  hasEnrichedTranscript: boolean
  fromDiarization: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Safe filename segment for downloads. */
export function meetingExportBasename(title: string, meetingId: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\p{L}\p{N}\s\-_.()]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 60)
  const core = cleaned.length > 0 ? cleaned : `meeting-${meetingId.slice(0, 8)}`
  return core
}

export function buildMeetingMarkdown(doc: MeetingExportDocument): string {
  const lines: string[] = []
  lines.push(`# ${doc.title}`)
  lines.push("")
  lines.push(`- **Meeting ID:** \`${doc.meetingId}\``)
  if (doc.recordedAtLabel) lines.push(`- **Recorded:** ${doc.recordedAtLabel}`)
  if (doc.durationSec != null && doc.durationSec > 0) {
    lines.push(`- **Duration:** ${formatDurationSeconds(doc.durationSec)}`)
  }
  lines.push(`- **Lines:** ${doc.normalized.entries.length}`)
  if (doc.hasEnrichedTranscript) lines.push(`- **Enriched transcript:** yes`)
  if (doc.fromDiarization) lines.push(`- **Diarized:** yes`)
  lines.push("")
  lines.push("## Transcript")
  lines.push("")
  for (const e of doc.normalized.entries) {
    const ts = formatTranscriptTimestamp(e.startSeconds)
    lines.push(`**[${ts}] ${e.speaker}:** ${e.text}`.trim())
    lines.push("")
  }
  return lines.join("\n").trimEnd() + "\n"
}

export function buildMeetingJson(doc: MeetingExportDocument): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    meeting: doc.summary,
    meetingId: doc.meetingId,
    displayTitle: doc.title,
    transcript: {
      ...doc.normalized,
      entries: doc.normalized.entries.map((e) => ({ ...e })),
    },
    flags: {
      hasEnrichedTranscript: doc.hasEnrichedTranscript,
      fromDiarization: doc.fromDiarization,
    },
  }
  return JSON.stringify(payload, null, 2) + "\n"
}

export function buildMeetingPrintHtml(doc: MeetingExportDocument): string {
  const metaBits: string[] = [`<strong>ID</strong> ${escapeHtml(doc.meetingId)}`]
  if (doc.recordedAtLabel) metaBits.push(`<strong>Recorded</strong> ${escapeHtml(doc.recordedAtLabel)}`)
  if (doc.durationSec != null && doc.durationSec > 0) {
    metaBits.push(`<strong>Duration</strong> ${escapeHtml(formatDurationSeconds(doc.durationSec))}`)
  }
  const entryRows = doc.normalized.entries
    .map((e) => {
      const ts = escapeHtml(formatTranscriptTimestamp(e.startSeconds))
      const sp = escapeHtml(e.speaker)
      const tx = escapeHtml(e.text)
      return `<tr><td class="ts">${ts}</td><td class="sp">${sp}</td><td class="tx">${tx}</td></tr>`
    })
    .join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(doc.title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111; max-width: 48rem; margin: 1.5rem auto; padding: 0 1rem; line-height: 1.45; }
    h1 { font-size: 1.35rem; margin: 0 0 0.75rem; }
    .meta { font-size: 0.85rem; color: #444; margin-bottom: 1.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; vertical-align: top; padding: 0.35rem 0.5rem; border-bottom: 1px solid #e5e5e5; }
    th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
    .ts { width: 4rem; white-space: nowrap; color: #555; font-variant-numeric: tabular-nums; }
    .sp { width: 7rem; font-weight: 600; color: #222; }
    @media print {
      body { margin: 0; max-width: none; }
      .meta { color: #000; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(doc.title)}</h1>
  <p class="meta">${metaBits.join(" · ")}</p>
  <table>
    <thead><tr><th>Time</th><th>Speaker</th><th>Text</th></tr></thead>
    <tbody>${entryRows}</tbody>
  </table>
</body>
</html>`
}

export function triggerTextDownload(filename: string, mime: string, body: string): void {
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Opens a printable HTML document. User can choose "Save as PDF" in the print dialog.
 */
export function openMeetingPrintDialog(doc: MeetingExportDocument): void {
  const html = buildMeetingPrintHtml(doc)
  const w = window.open("", "_blank", "noopener,noreferrer")
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  const runPrint = () => {
    try {
      w.print()
    } catch {
      // ignore
    }
  }
  if (w.document.readyState === "complete") {
    setTimeout(runPrint, 100)
  } else {
    w.addEventListener("load", () => setTimeout(runPrint, 100), { once: true })
  }
}
