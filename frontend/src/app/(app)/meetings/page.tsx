"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Search,
  Video,
  ChevronLeft,
  ChevronRight,
  Library,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MeetingRowCard } from "@/components/app/meeting/MeetingRowCard"
import { LoadingDots } from "@/components/app/workspace/LoadingDots"
import { PageHeader } from "@/components/app/workspace/PageHeader"
import { WorkspaceSurface } from "@/components/app/workspace/WorkspaceSurface"
import { useApi } from "@/hooks/useApi"
import type { MeetingSummary } from "@/lib/api"

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Meeting library"
        title="Search every synced meeting"
        description="Keep the existing filters and pagination, but present them in a cleaner review workflow built for scanning and opening transcripts fast."
        actions={
          !loading ? (
            <div className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/72">
              {total} total meetings
            </div>
          ) : undefined
        }
      />

      <WorkspaceSurface className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              placeholder="Search by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-14 w-full rounded-[24px] border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/32 focus:border-cyan-300/30 focus:outline-none focus:ring-2 focus:ring-cyan-300/15"
              aria-label="Search meetings"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.035] px-4 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-2 w-full bg-transparent text-sm text-white focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.035] px-4 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-2 w-full bg-transparent text-sm text-white focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>
        </div>
      </WorkspaceSurface>

      <WorkspaceSurface className="p-5 sm:p-6" variant="panel">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
            <Library className="h-5 w-5 text-cyan-100" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/36">Results</p>
            <p className="text-sm text-white/60">Title, time, duration, transcript line count, and status.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <LoadingDots />
            <p className="text-sm text-white/48">Loading meetings…</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="workspace-card px-6 py-16 text-center">
            <Video className="mx-auto h-12 w-12 text-white/28" />
            <p className="mt-4 text-sm text-white/52">
              {search || dateFrom || dateTo
                ? "No meetings match your filters."
                : "No meetings found. Sync from the desktop app to populate this list."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <MeetingRowCard
                key={meeting.id}
                meeting={meeting}
                href={`/meetings/${meeting.id}`}
                showStatus
              />
            ))}
          </div>
        )}
      </WorkspaceSurface>

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
          <p className="text-xs text-white/44">
            Page {page} of {pages} ({total} meetings)
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-white/10 px-4 text-white/72 hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-white/10 px-4 text-white/72 hover:bg-white/[0.08] hover:text-white"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
