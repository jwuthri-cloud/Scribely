"use client"

import Link from "next/link"
import { Calendar, ExternalLink, Users, Video } from "lucide-react"
import type { CalendarEventSummary } from "@/lib/api"
import { cn } from "@/lib/utils"

const platformLabel: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Teams",
  other: "Meeting",
  none: "",
}

function platformBadgeClass(platform: string): string {
  if (platform === "google_meet") return "bg-emerald-500/15 text-emerald-300/90"
  if (platform === "zoom") return "bg-blue-500/15 text-blue-300/90"
  if (platform === "teams") return "bg-violet-500/15 text-violet-300/90"
  return "bg-white/[0.06] text-white/50"
}

export function CalendarEventCard({ event }: { event: CalendarEventSummary }) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const timeFmt: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
  const timeStr = `${start.toLocaleString(undefined, timeFmt)} – ${end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`

  const plat = platformLabel[event.meeting_platform] || ""

  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.1] hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
          <Calendar className="h-4 w-4 text-white/60" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-white">
              {event.title || "(No title)"}
            </p>
            {plat && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  platformBadgeClass(event.meeting_platform)
                )}
              >
                <Video className="h-3 w-3" />
                {plat}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-white/45">{timeStr}</p>
          {event.organizer_email && (
            <p className="mt-0.5 truncate text-xs text-white/35">Organizer: {event.organizer_name || event.organizer_email}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <Link
          href={`/calendar/${event.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08]"
        >
          <Users className="h-3.5 w-3.5" />
          Details
        </Link>
        {event.meeting_url && (
          <>
            <a
              href={`scribely://meeting?url=${encodeURIComponent(event.meeting_url)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/75 transition-colors hover:bg-white/[0.07]"
            >
              Scribely
            </a>
            <a
              href={event.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.12]"
            >
              Join
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </div>
    </div>
  )
}
