"use client"

import Link from "next/link"
import { ArrowRight, Clock3, FileText, Video } from "lucide-react"
import type { MeetingSummary } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { cn, formatDurationSeconds } from "@/lib/utils"

const statusColor: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
  processing: "bg-amber-500/15 text-amber-300 border-amber-400/25",
  uploaded: "bg-sky-500/15 text-sky-300 border-sky-400/25",
  failed: "bg-red-500/15 text-red-300 border-red-400/25",
}

export function MeetingRowCard({
  meeting,
  href,
  showStatus = true,
  className,
}: {
  meeting: MeetingSummary
  href: string
  showStatus?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "workspace-card group relative flex items-center justify-between gap-4 overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-white/[0.055] md:p-5",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-y-4 left-3 w-px bg-gradient-to-b from-cyan-300/80 via-violet-300/45 to-transparent" />
      <div className="relative flex min-w-0 items-center gap-4 pl-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
          <Video className="h-5 w-5 text-cyan-100" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold tracking-[-0.03em] text-white">
            {meeting.title || "Untitled Meeting"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
            {meeting.recorded_at ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3 w-3" />
                {new Date(meeting.recorded_at).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
            {meeting.duration_seconds != null && meeting.duration_seconds > 0 ? (
              <span>{formatDurationSeconds(meeting.duration_seconds)}</span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              {meeting.entry_count} lines
            </span>
          </div>
        </div>
      </div>
      <div className="relative flex shrink-0 items-center gap-2">
        {showStatus && (
          <Badge
            variant="outline"
            className={cn(
              "hidden rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] sm:inline-flex",
              statusColor[meeting.status] ?? "border-white/15"
            )}
          >
            {meeting.status}
          </Badge>
        )}
        <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/46 md:block">
          Open
        </div>
        <ArrowRight className="h-5 w-5 text-white/30 transition-transform group-hover:translate-x-1 group-hover:text-white/80" />
      </div>
    </Link>
  )
}
