"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TooltipProps } from "recharts"
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

function tickLabelForMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number)
  if (!y || !m) return yyyyMm
  const d = new Date(y, m - 1, 1)
  const short = d.toLocaleDateString(undefined, { month: "short" })
  if (m === 1) {
    return `${short} '${String(y).slice(-2)}`
  }
  return short
}

function monthTooltipTitle(yyyyMm: string): string {
  const [y, mo] = yyyyMm.split("-").map(Number)
  if (!y || !mo) return yyyyMm
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

type ChartRow = { monthKey: string; count: number; label: string; tooltipMonth: string }

function ActivityTooltip({
  active,
  payload,
}: TooltipProps<number, string> & { payload?: Array<{ payload: ChartRow }> }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as ChartRow
  return (
    <div className="rounded-lg border border-white/[0.12] bg-zinc-950/95 px-3 py-2 text-xs shadow-xl ring-1 ring-white/[0.06] backdrop-blur-sm">
      <p className="font-medium text-white/90">{row.tooltipMonth}</p>
      <p className="mt-0.5 tabular-nums text-white/55">
        {row.count} meeting{row.count === 1 ? "" : "s"}
      </p>
    </div>
  )
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
  const gradientId = React.useId().replace(/:/g, "")
  const series = React.useMemo(() => padLast12Months(meetingsPerMonth), [meetingsPerMonth])
  const chartData = React.useMemo<ChartRow[]>(
    () =>
      series.map((point) => ({
        monthKey: point.month,
        count: point.count,
        label: tickLabelForMonth(point.month),
        tooltipMonth: monthTooltipTitle(point.month),
      })),
    [series]
  )
  const counts = series.map((s) => s.count)
  const hasAny = counts.some((c) => c > 0)

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
          <div className="flex h-[12.5rem] items-end gap-1.5 pt-1">
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
            className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent px-1 pb-1 pt-2 sm:px-2"
            aria-label="Meeting counts per month, last 12 months"
          >
            <div className="h-[200px] w-full min-w-0 sm:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 4, left: 0, bottom: 4 }}
                  barCategoryGap="12%"
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="rgb(91 33 182)" stopOpacity={0.55} />
                      <stop offset="55%" stopColor="rgb(139 92 246)" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="rgb(196 181 253)" stopOpacity={0.95} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="4 6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "rgba(255,255,255,0.38)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                    interval={0}
                    height={36}
                  />
                  <YAxis
                    width={28}
                    tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickCount={4}
                  />
                  <Tooltip
                    content={<ActivityTooltip />}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={36}>
                    {chartData.map((entry) => (
                      <Cell
                        key={`cell-${entry.monthKey}`}
                        fill={entry.count > 0 ? `url(#${gradientId})` : "rgba(255,255,255,0.07)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
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
