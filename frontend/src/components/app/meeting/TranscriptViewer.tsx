"use client"

import { useMemo, useState, useEffect } from "react"
import { motion } from "framer-motion"
import { LayoutList, MessageSquare, Search } from "lucide-react"
import { ConversationTranscriptView } from "@/components/app/meeting/ConversationTranscriptView"
import {
  formatTranscriptTimestamp,
  speakerColorIndex,
  type NormalizedTranscriptEntry,
} from "@/lib/meeting-transcript"
import { cn } from "@/lib/utils"

const ROW_ACCENTS = [
  { border: "border-l-violet-400/70", pill: "border-violet-500/30 bg-violet-500/10 text-violet-200" },
  { border: "border-l-sky-400/70", pill: "border-sky-500/30 bg-sky-500/10 text-sky-200" },
  { border: "border-l-emerald-400/70", pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
  { border: "border-l-amber-400/70", pill: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  { border: "border-l-rose-400/70", pill: "border-rose-500/30 bg-rose-500/10 text-rose-200" },
  { border: "border-l-cyan-400/70", pill: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" },
  { border: "border-l-fuchsia-400/70", pill: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200" },
  { border: "border-l-orange-400/70", pill: "border-orange-500/30 bg-orange-500/10 text-orange-200" },
] as const

type ViewMode = "log" | "conversation"

export function TranscriptViewer({
  entries,
  className,
}: {
  entries: NormalizedTranscriptEntry[]
  className?: string
}) {
  const [mode, setMode] = useState<ViewMode>("conversation")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 280)
    return () => clearTimeout(t)
  }, [search])

  const filtered = useMemo(() => {
    if (!debounced) return entries
    return entries.filter((e) => {
      const blob = `${e.speaker} ${e.text}`.toLowerCase()
      return blob.includes(debounced)
    })
  }, [entries, debounced])

  const useMotion = filtered.length <= 64 && mode === "log"

  const segmentBtn = (active: boolean) =>
    cn(
      "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:flex-none sm:rounded-md sm:px-3.5",
      active
        ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/[0.06]"
        : "text-white/45 hover:bg-white/[0.05] hover:text-white/85"
    )

  return (
    <section
      className={cn(
        "workspace-card relative overflow-hidden rounded-2xl sm:rounded-[28px]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex flex-col gap-4 border-b border-white/[0.07] bg-white/[0.02] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
            Transcript
          </span>
          <div
            className="flex h-10 w-full rounded-xl border border-white/[0.08] bg-black/25 p-1 sm:h-9 sm:w-auto"
            role="tablist"
            aria-label="Transcript view mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "conversation"}
              onClick={() => setMode("conversation")}
              className={segmentBtn(mode === "conversation")}
            >
              <MessageSquare className="h-3.5 w-3.5 opacity-80" />
              Conversation
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "log"}
              onClick={() => setMode("log")}
              className={segmentBtn(mode === "log")}
            >
              <LayoutList className="h-3.5 w-3.5 opacity-80" />
              Log
            </button>
          </div>
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            placeholder="Search transcript…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400/25 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
            aria-label="Search transcript"
          />
        </div>
      </div>

      {mode === "conversation" ? (
        <div className="max-h-[min(72vh,760px)] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-20 text-center text-sm text-white/45">
              {entries.length === 0 ? "No lines in this transcript." : "No lines match your search."}
            </div>
          ) : (
            <ConversationTranscriptView entries={filtered} />
          )}
        </div>
      ) : (
        <div className="max-h-[min(72vh,760px)] overflow-y-auto">
          <div className="min-w-0 divide-y divide-white/[0.06]">
            {filtered.length === 0 ? (
              <div className="px-4 py-20 text-center text-sm text-white/45">
                {entries.length === 0
                  ? "No lines in this transcript."
                  : "No lines match your search."}
              </div>
            ) : (
              filtered.map((entry, i) => {
                const acc = ROW_ACCENTS[speakerColorIndex(entry.speaker) % ROW_ACCENTS.length]
                const rowClass = cn(
                  "group flex gap-3 px-3 py-3 transition-colors hover:bg-white/[0.04] sm:gap-4 sm:px-6 sm:py-3.5",
                  "border-l-[3px]",
                  acc.border
                )
                return (
                  <motion.div
                    key={entry.id}
                    className={rowClass}
                    initial={useMotion ? { opacity: 0, y: 6 } : false}
                    animate={useMotion ? { opacity: 1, y: 0 } : undefined}
                    transition={{
                      duration: 0.18,
                      delay: useMotion ? Math.min(i * 0.015, 0.45) : 0,
                    }}
                  >
                    <span
                      className="w-12 shrink-0 pt-0.5 text-right font-mono text-[11px] tabular-nums text-cyan-400/70 sm:w-14"
                      title={entry.startSeconds != null ? `${entry.startSeconds.toFixed(1)}s` : undefined}
                    >
                      {formatTranscriptTimestamp(entry.startSeconds)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span
                          className={cn("inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-medium", acc.pill)}
                        >
                          {entry.speaker}
                        </span>
                      </div>
                      <p className="text-[15px] leading-relaxed text-white/[0.94] sm:text-sm">
                        {entry.text || "—"}
                      </p>
                    </div>
                  </motion.div>
                )
              })
            )}
          </div>
        </div>
      )}

      <p className="border-t border-white/[0.06] bg-black/20 px-4 py-3 text-center text-[11px] text-white/40">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>
            Showing <span className="tabular-nums text-white/55">{filtered.length}</span> of{" "}
            <span className="tabular-nums text-white/55">{entries.length}</span> lines
          </span>
          {debounced ? <span className="text-violet-300/70">· Filtered</span> : null}
          <span className="text-white/25">·</span>
          <span>{mode === "conversation" ? "Conversation" : "Log"} view</span>
        </span>
      </p>
    </section>
  )
}
