"use client"

import { useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { DemoTranscriptEntry } from "./demo-data"
import { DemoWaveform } from "./demo-waveform"

const SPEAKER_COLORS: Record<string, string> = {
  You: "var(--accent)",
  Them: "var(--success)",
}

function SpeakerLabel({ speaker }: { speaker: string }) {
  const color = SPEAKER_COLORS[speaker] ?? "var(--warning)"
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {speaker}
    </span>
  )
}

interface DemoTranscriptProps {
  entries: DemoTranscriptEntry[]
  isActive: boolean
}

export function DemoTranscript({ entries, isActive }: DemoTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  // Group consecutive entries by speaker
  const grouped: { speaker: string; entries: DemoTranscriptEntry[] }[] = []
  for (const entry of entries) {
    const last = grouped[grouped.length - 1]
    if (last && last.speaker === entry.speaker) {
      last.entries.push(entry)
    } else {
      grouped.push({ speaker: entry.speaker, entries: [entry] })
    }
  }

  return (
    <div
      className="mx-3 mb-2 rounded-xl overflow-hidden shrink-0"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Waveform */}
      {isActive && <DemoWaveform />}

      {/* Transcript entries */}
      <div
        ref={scrollRef}
        className="max-h-[140px] overflow-y-auto px-3 pb-2 space-y-2 demo-scrollbar"
      >
        {entries.length === 0 && (
          <div className="flex items-center gap-1.5 py-2">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--accent)" }}
            />
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Waiting for speech...
            </span>
          </div>
        )}

        <AnimatePresence>
          {grouped.map((group, i) => (
            <motion.div
              key={`${group.speaker}-${group.entries[0]?.timestamp}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-0.5"
            >
              <div className="flex items-center gap-1.5">
                <SpeakerLabel speaker={group.speaker} />
                <span
                  className="text-[9px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {group.entries[0]?.timestamp}
                </span>
              </div>
              <p
                className="text-[12px] leading-relaxed pl-0.5"
                style={{ color: "var(--text)" }}
              >
                {group.entries.map((e) => e.text).join(" ")}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>

        {isActive && entries.length > 0 && (
          <div className="flex items-center gap-1 py-0.5">
            <span
              className="w-1 h-1 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--accent)" }}
            />
            <span
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Listening...
            </span>
          </div>
        )}
      </div>

      {/* Stop meeting button */}
      <div className="px-3 pb-2">
        <button
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg transition-all hover:brightness-110 active:scale-[0.98] cursor-default"
          style={{ backgroundColor: "var(--error)", color: "#fff" }}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          Stop Meeting
        </button>
      </div>
    </div>
  )
}
