"use client"

import { useMemo } from "react"
import {
  formatTranscriptTimestamp,
  groupConsecutiveSpeakerBlocks,
  speakerColorIndex,
  type NormalizedTranscriptEntry,
} from "@/lib/meeting-transcript"
import { cn } from "@/lib/utils"

const BUBBLE = [
  {
    user:
      "ml-auto rounded-br-lg border border-violet-300/10 bg-[linear-gradient(135deg,rgba(124,58,237,0.98),rgba(37,99,235,0.92))] text-white",
    meta: "text-violet-100/72",
  },
  {
    user: "mr-auto rounded-bl-lg border border-white/10 bg-white/[0.05] text-white/90",
    meta: "text-white/48",
  },
] as const

export function ConversationTranscriptView({
  entries,
}: {
  entries: NormalizedTranscriptEntry[]
}) {
  const blocks = useMemo(() => groupConsecutiveSpeakerBlocks(entries), [entries])

  return (
    <div className="space-y-5 px-2 py-4 sm:px-4">
      {blocks.map((block, bi) => {
        const side = speakerColorIndex(block.speaker) % 2
        const palette = BUBBLE[side]
        const align = side === 0 ? "items-end" : "items-start"
        const start = block.lines[0]?.startSeconds

        return (
          <div key={`${block.speaker}-${bi}`} className={cn("flex flex-col gap-1", align)}>
            <span
              className={cn(
                "max-w-[min(100%,40rem)] rounded-[26px] px-4 py-3 text-sm leading-relaxed shadow-[0_20px_40px_-32px_rgba(0,0,0,0.95)]",
                palette.user
              )}
            >
              <span
                className={cn(
                  "mb-2 block text-[10px] font-semibold uppercase tracking-[0.24em]",
                  palette.meta
                )}
              >
                {block.speaker}
                {start != null ? ` · ${formatTranscriptTimestamp(start)}` : ""}
              </span>
              <div className="space-y-2">
                {block.lines.map((line) => (
                  <p key={line.id} className="whitespace-pre-wrap">
                    {line.text || "—"}
                  </p>
                ))}
              </div>
            </span>
          </div>
        )
      })}
    </div>
  )
}
