"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Search,
  Video,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useApi } from "@/hooks/useApi"
import type { MeetingSummary } from "@/lib/api"
import { cn } from "@/lib/utils"

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

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  useEffect(() => {
    setPage(1)
  }, [search, dateFrom, dateTo])

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }

  const statusColor: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    processing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    uploaded: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-white">
          Meetings
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Browse and search your transcribed meetings.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 [color-scheme:dark]"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Meeting list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/30" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-card p-12 text-center">
          <Video className="mx-auto h-10 w-10 text-white/20" />
          <p className="mt-4 text-sm text-white/40">
            {search || dateFrom || dateTo
              ? "No meetings match your filters."
              : "No meetings found. Meetings synced from the desktop app will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-card p-4 transition-colors hover:border-white/[0.12]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-lg bg-white/[0.06] p-2 shrink-0">
                  <Video className="h-4 w-4 text-white/50" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {meeting.title || "Untitled Meeting"}
                  </p>
                  <p className="text-xs text-white/40">
                    {meeting.recorded_at
                      ? new Date(meeting.recorded_at).toLocaleDateString(
                          undefined,
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )
                      : "—"}
                    {meeting.duration_seconds
                      ? ` · ${formatDuration(meeting.duration_seconds)}`
                      : ""}
                    {` · ${meeting.entry_count} entries`}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 ml-3 text-[10px]",
                  statusColor[meeting.status] || ""
                )}
              >
                {meeting.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">
            Page {page} of {pages} ({total} meetings)
          </p>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
