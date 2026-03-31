"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Clock3, FileText, ArrowRight, Video, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface MonthlyMeetingPoint {
  month: string
  count: number
}

interface MeetingActivityCardProps {
  alertMessage?: string
  totalMeetings: number
  totalDurationSeconds: number
  totalTranscriptLines: number
  /** From dashboard stats: `{ month: "YYYY-MM", count }` — may omit zero months */
  meetingsPerMonth: MonthlyMeetingPoint[]
  ctaText?: string
  ctaHref?: string
  className?: string
  loading?: boolean
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
}

const barVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 28 },
  },
}

/** Build last 12 calendar months (YYYY-MM) with counts filled from API rows */
function padLast12Months(data: MonthlyMeetingPoint[]): MonthlyMeetingPoint[] {
  const byMonth = new Map(data.map((d) => [d.month, d.count]))
  const out: MonthlyMeetingPoint[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    out.push({ month: key, count: byMonth.get(key) ?? 0 })
  }
  return out
}

function shortMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number)
  if (!y || !m) return yyyyMm
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString(undefined, { month: "short" })
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function MeetingActivityCard({
  alertMessage,
  totalMeetings,
  totalDurationSeconds,
  totalTranscriptLines,
  meetingsPerMonth,
  ctaText = "Browse all meetings",
  ctaHref = "/meetings",
  className,
  loading = false,
}: MeetingActivityCardProps) {
  const series = React.useMemo(() => padLast12Months(meetingsPerMonth), [meetingsPerMonth])
  const counts = series.map((s) => s.count)
  const maxCount = Math.max(...counts, 1)
  const hasAny = counts.some((c) => c > 0)

  /** Sqrt scaling so small counts still read; zero stays a flat tick */
  const barHeightsPct = counts.map((c) => {
    if (c <= 0) return 6
    const t = Math.sqrt(c) / Math.sqrt(maxCount)
    return Math.max(14, Math.round(t * 100))
  })

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-6",
        className
      )}
    >
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm font-medium text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{alertMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-3">
          <div className="h-10 w-40 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-5 w-56 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ) : (
        <div className="flex flex-col">
          <h2 className="text-4xl font-bold tracking-tight text-white">
            {totalMeetings} Meeting{totalMeetings !== 1 ? "s" : ""}
          </h2>
          <p className="mt-1 text-sm text-white/40">
            {formatDuration(totalDurationSeconds)} recorded &middot;{" "}
            {totalTranscriptLines.toLocaleString()} transcript lines
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="h-3 w-32 animate-pulse rounded bg-white/[0.05]" />
          <div className="flex h-[7.5rem] items-end gap-1.5 pt-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              >
                <div
                  className="w-full max-w-[28px] animate-pulse rounded-md bg-white/[0.08]"
                  style={{ height: `${20 + ((i * 7) % 55)}%` }}
                />
                <div className="h-2.5 w-5 animate-pulse rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      ) : hasAny ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-white/45">
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-violet-400/80" />
            <span className="text-[11px] font-medium uppercase tracking-[0.12em]">
              Meetings per month
            </span>
            <span className="text-[11px] text-white/25">· last 12 months</span>
          </div>

          <div
            className="relative rounded-lg border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent px-2 pb-1 pt-3"
            aria-label="Meeting counts per month, last 12 months"
          >
            {/* faint grid */}
            <div
              className="pointer-events-none absolute inset-x-2 top-3 bottom-8 flex flex-col justify-between opacity-[0.35]"
              aria-hidden
            >
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-px w-full bg-white/[0.06]" />
              ))}
            </div>

            <motion.div
              className="relative flex h-[7.5rem] items-stretch gap-1 sm:gap-1.5"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {series.map((point, index) => (
                <div
                  key={point.month}
                  className="flex min-w-0 flex-1 flex-col justify-end gap-1.5"
                >
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-end gap-0.5">
                    {point.count > 0 && (
                      <span
                        className="shrink-0 text-[10px] font-medium tabular-nums text-white/50 sm:text-[11px]"
                        title={`${point.month}: ${point.count} meeting${point.count === 1 ? "" : "s"}`}
                      >
                        {point.count}
                      </span>
                    )}
                    <div className="flex w-full min-h-0 flex-1 flex-col justify-end">
                      <motion.div
                        className={cn(
                          "mx-auto w-full max-w-[32px] rounded-t-md shadow-[0_0_20px_-8px_rgba(139,92,246,0.45)]",
                          point.count > 0
                            ? "bg-gradient-to-t from-violet-700/50 via-violet-500/70 to-violet-300/90"
                            : "bg-white/[0.06]"
                        )}
                        style={{
                          height: `${barHeightsPct[index]}%`,
                          minHeight: point.count > 0 ? 4 : 3,
                        }}
                        variants={barVariants}
                        title={`${point.month}: ${point.count} meeting${point.count === 1 ? "" : "s"}`}
                      />
                    </div>
                  </div>
                  <span
                    className="w-full shrink-0 truncate text-center text-[9px] text-white/30 sm:text-[10px]"
                    title={point.month}
                  >
                    {shortMonthLabel(point.month)}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-6 text-center">
          <BarChart3 className="h-8 w-8 text-white/15" />
          <p className="text-sm text-white/35">No monthly activity yet</p>
          <p className="max-w-xs text-xs text-white/25">
            Sync meetings from the desktop app to see your activity here.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <Video className="h-4 w-4 shrink-0" />
          {totalMeetings} synced
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-4 w-4 shrink-0" />
          {formatDuration(totalDurationSeconds)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-4 w-4 shrink-0" />
          {totalTranscriptLines.toLocaleString()} lines
        </span>
      </div>

      <Button asChild size="lg" className="w-full">
        <Link href={ctaHref}>
          {ctaText} <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}
