"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Search,
  Video,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  ArrowRight,
  CalendarDays,
  X,
} from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { formatDurationSeconds } from "@/lib/utils"
import { LoadingDots } from "@/components/app/workspace/LoadingDots"
import { MeetingActivityCard } from "@/components/ui/meeting-activity-card"
import type { MeetingSummary, DashboardStats } from "@/lib/api"

const statusDot: Record<string, string> = {
  completed: "bg-emerald-400",
  processing: "bg-amber-400",
  uploaded: "bg-sky-400",
  failed: "bg-red-400",
}

function MeetingRow({ meeting }: { meeting: MeetingSummary }) {
  const dateStr = meeting.recorded_at
    ? new Date(meeting.recorded_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="group flex items-center gap-4 border-b border-white/[0.06] px-4 py-4 transition-colors last:border-0 hover:bg-white/[0.03] sm:px-6"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
        <Video className="h-4 w-4 text-white/60" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {meeting.title || "Untitled Meeting"}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-white/40">
          {dateStr && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {dateStr}
            </span>
          )}
          {meeting.duration_seconds != null && meeting.duration_seconds > 0 && (
            <span>{formatDurationSeconds(meeting.duration_seconds)}</span>
          )}
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {meeting.entry_count} lines
          </span>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <span className="inline-flex items-center gap-1.5 text-xs text-white/40">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot[meeting.status] ?? "bg-white/30"}`} />
          {meeting.status}
        </span>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
    </Link>
  )
}

export default function MeetingsPage() {
  const api = useApi()
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const limit = 20

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getMeetings({
        page,
        limit,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      setMeetings(data.meetings)
      setTotal(data.total)
      setPages(data.pages)
    } catch {
      // API unavailable
    } finally {
      setLoading(false)
    }
  }, [api, page, search, dateFrom, dateTo])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const data = await api.getDashboardStats()
      setStats(data)
    } catch {
      // API unavailable
    } finally {
      setStatsLoading(false)
    }
  }, [api])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    setPage(1)
  }, [search, dateFrom, dateTo])

  const hasFilters = search || dateFrom || dateTo

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Meetings</h1>
          <p className="mt-1 text-sm text-white/40">
            Browse and search all synced meeting transcripts.
          </p>
        </div>
        {!loading && (
          <p className="text-sm tabular-nums text-white/40">
            {total} meeting{total !== 1 ? "s" : ""} total
          </p>
        )}
      </div>

      {/* Activity summary card */}
      <MeetingActivityCard
        totalMeetings={stats?.total_meetings ?? 0}
        totalDurationSeconds={stats?.total_duration_seconds ?? 0}
        totalTranscriptLines={stats?.total_transcript_lines ?? 0}
        meetingsPerMonth={stats?.meetings_per_month ?? []}
        alertMessage={
          stats?.processing_count
            ? `${stats.processing_count} meeting${stats.processing_count > 1 ? "s" : ""} currently processing`
            : undefined
        }
        ctaText="Open AI chat"
        ctaHref="/chat"
        loading={statsLoading}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
            aria-label="Search meetings"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 text-xs text-white focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]"
              aria-label="From date"
            />
          </div>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 text-xs text-white focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]"
              aria-label="To date"
            />
          </div>
        </div>
      </div>

      {/* Meetings list */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <LoadingDots />
            <p className="text-sm text-white/40">Loading meetings...</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Video className="h-10 w-10 text-white/15" />
            <p className="text-sm text-white/40">
              {hasFilters
                ? "No meetings match your filters."
                : "No meetings found. Sync from the desktop app to get started."}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("")
                  setDateFrom("")
                  setDateTo("")
                }}
                className="mt-1 text-xs text-white/30 underline underline-offset-2 hover:text-white/50"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div>
            {meetings.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs tabular-nums text-white/30">
            Page {page} of {pages}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
