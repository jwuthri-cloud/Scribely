import { describe, expect, it } from "vitest"
import {
  buildMeetingJson,
  buildMeetingMarkdown,
  buildMeetingPrintHtml,
  meetingExportBasename,
  type MeetingExportDocument,
} from "./meeting-export"

function sampleDoc(overrides: Partial<MeetingExportDocument> = {}): MeetingExportDocument {
  return {
    meetingId: "550e8400-e29b-41d4-a716-446655440000",
    title: "Q1 Planning",
    recordedAtLabel: "Jan 15, 2026, 3:00 PM",
    durationSec: 125,
    summary: null,
    normalized: {
      entries: [
        {
          id: "a",
          speaker: "Alex",
          text: "Hello team.",
          startSeconds: 0,
          endSeconds: 2,
        },
        {
          id: "b",
          speaker: "Blake",
          text: 'What about <script>alert(1)</script>?',
          startSeconds: 42.5,
          endSeconds: null,
        },
      ],
      summary: { durationMs: 125000 },
      createdAt: "2026-01-15T20:00:00.000Z",
      version: 1,
      fromDiarization: true,
    },
    hasEnrichedTranscript: true,
    fromDiarization: true,
    ...overrides,
  }
}

describe("meetingExportBasename", () => {
  it("falls back to meeting id prefix when title empty", () => {
    expect(meetingExportBasename("", "abc-def-1234-5678")).toBe("meeting-abc-def-")
  })

  it("sanitizes title for filename", () => {
    expect(meetingExportBasename("Foo / Bar: Baz!", "id")).toBe("Foo Bar Baz")
  })
})

describe("buildMeetingMarkdown", () => {
  it("includes header and transcript lines", () => {
    const md = buildMeetingMarkdown(sampleDoc())
    expect(md).toContain("# Q1 Planning")
    expect(md).toContain("550e8400-e29b-41d4-a716-446655440000")
    expect(md).toContain("**[0:00] Alex:** Hello team.")
    expect(md).toContain("**[0:42] Blake:**")
    expect(md).toContain("Enriched transcript")
    expect(md).toContain("Diarized")
  })
})

describe("buildMeetingJson", () => {
  it("stringifies payload with formatVersion", () => {
    const j = buildMeetingJson(sampleDoc())
    const p = JSON.parse(j) as { formatVersion: number; meetingId: string; transcript: { entries: unknown[] } }
    expect(p.formatVersion).toBe(1)
    expect(p.meetingId).toContain("550e8400")
    expect(p.transcript.entries).toHaveLength(2)
  })
})

describe("buildMeetingPrintHtml", () => {
  it("escapes html in transcript text", () => {
    const html = buildMeetingPrintHtml(sampleDoc())
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>alert")
  })
})
