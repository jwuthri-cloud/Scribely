"use client"

import { useMemo, useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search } from "lucide-react"
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

export function TranscriptViewer({
  entries,
  className,
  editable = false,
  onChange,
  disabled = false,
}: {
  entries: NormalizedTranscriptEntry[]
  className?: string
  /** When true, speaker and text are editable; use with `onChange` for controlled updates. */
  editable?: boolean
  onChange?: (next: NormalizedTranscriptEntry[]) => void
  disabled?: boolean
}) {
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

  const useMotion = filtered.length <= 64

  return (
    <section
      className={cn(
        "workspace-card relative w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[28px]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex flex-col gap-4 border-b border-white/[0.07] bg-white/[0.02] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
          Transcript
        </span>

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

      <div className="max-h-[min(72vh,760px)] overflow-y-auto">
        <div className="min-w-0 divide-y divide-white/[0.06]">
          {filtered.length === 0 ? (
            <div className="px-4 py-20 text-center text-sm text-white/45">
              {entries.length === 0 ? "No lines in this transcript." : "No lines match your search."}
            </div>
          ) : (
            filtered.map((entry, i) => {
              const acc = ROW_ACCENTS[speakerColorIndex(entry.speaker) % ROW_ACCENTS.length]
              const rowClass = cn(
                "group flex min-w-0 gap-3 px-3 py-3 transition-colors hover:bg-white/[0.04] sm:gap-4 sm:px-6 sm:py-3.5",
                "border-l-[3px]",
                acc.border
              )
              const idxInFull = entries.findIndex((e) => e.id === entry.id)
              const patch = (partial: Partial<NormalizedTranscriptEntry>) => {
                if (!onChange || idxInFull < 0) return
                const next = entries.map((e, j) =>
                  j === idxInFull ? { ...e, ...partial } : e
                )
                onChange(next)
              }
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
                      {editable ? (
                        <input
                          type="text"
                          value={entry.speaker}
                          disabled={disabled}
                          onChange={(e) => patch({ speaker: e.target.value })}
                          aria-label={`Speaker at ${formatTranscriptTimestamp(entry.startSeconds)}`}
                          className={cn(
                            "max-w-full min-w-[6rem] rounded-full border bg-black/30 px-2 py-0.5 text-[11px] font-medium text-white outline-none",
                            "focus:border-violet-400/40 focus:ring-1 focus:ring-violet-500/25",
                            acc.pill
                          )}
                        />
                      ) : (
                        <span
                          className={cn(
                            "inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            acc.pill
                          )}
                        >
                          {entry.speaker}
                        </span>
                      )}
                    </div>
                    {editable ? (
                      <textarea
                        value={entry.text}
                        disabled={disabled}
                        onChange={(e) => patch({ text: e.target.value })}
                        rows={Math.min(8, Math.max(2, entry.text.split("\n").length))}
                        className="mt-1 w-full resize-y rounded-lg border border-white/[0.1] bg-black/25 px-3 py-2 text-[15px] leading-relaxed text-white/[0.94] outline-none placeholder:text-white/30 focus:border-violet-400/30 focus:ring-2 focus:ring-violet-500/15 sm:text-sm"
                        aria-label={`Transcript line at ${formatTranscriptTimestamp(entry.startSeconds)}`}
                      />
                    ) : (
                      <p className="break-words text-[15px] leading-relaxed text-white/[0.94] [overflow-wrap:anywhere] sm:text-sm">
                        {entry.text || "—"}
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      <p className="border-t border-white/[0.06] bg-black/20 px-4 py-3 text-center text-[11px] text-white/40">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>
            Showing <span className="tabular-nums text-white/55">{filtered.length}</span> of{" "}
            <span className="tabular-nums text-white/55">{entries.length}</span> lines
          </span>
          {debounced ? <span className="text-violet-300/70">· Filtered</span> : null}
        </span>
      </p>
    </section>
  )
}
