"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, Timer } from "lucide-react"
import type { CalendarEventSummary } from "@/lib/api"

const FIFTEEN_MIN_MS = 15 * 60 * 1000

export function NextMeetingBanner({ events }: { events: CalendarEventSummary[] }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const next = useMemo(() => {
    let best: { ev: CalendarEventSummary; ms: number } | null = null
    for (const ev of events) {
      const start = new Date(ev.start_time).getTime()
      const ms = start - now
      if (ms <= 0 || ms > FIFTEEN_MIN_MS) continue
      if (!best || ms < best.ms) best = { ev, ms }
    }
    return best
  }, [events, now])

  if (!next) return null

  const mins = Math.max(1, Math.ceil(next.ms / 60_000))
  const title = next.ev.title?.trim() || "Meeting"

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
          <Timer className="h-4 w-4 text-amber-200/90" />
        </div>
        <div>
          <p className="text-sm font-medium text-amber-100/95">Starting in about {mins} min</p>
          <p className="mt-0.5 text-xs text-white/50">{title}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {next.ev.meeting_url && (
          <a
            href={next.ev.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.14]"
          >
            Join
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <Link
          href={`/calendar/${next.ev.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/[0.08]"
        >
          Details
        </Link>
      </div>
    </div>
  )
}
