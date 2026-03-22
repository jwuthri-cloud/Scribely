"use client"

import Link from "next/link"
import { ArrowLeft, Calendar, Clock3, Hash, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { MeetingSummary } from "@/lib/api"
import { cn, formatDurationSeconds } from "@/lib/utils"

export function MeetingReviewHeader({
  meetingId,
  summary,
  hasEnrichedTranscript,
  transcriptEntryCount,
  transcriptDurationMs,
  createdAt,
  fromDiarization,
  backHref = "/meetings",
}: {
  meetingId: string
  summary: MeetingSummary | null
  hasEnrichedTranscript: boolean
  transcriptEntryCount: number
  transcriptDurationMs: number | undefined
  createdAt: string | null
  fromDiarization: boolean
  backHref?: string
}) {
  const title =
    summary?.title?.trim() ||
    `Meeting ${meetingId.slice(0, 8)}…`

  const recorded =
    summary?.recorded_at != null
      ? new Date(summary.recorded_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : createdAt != null
        ? new Date(createdAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : null

  const durationSec =
    summary?.duration_seconds != null
      ? summary.duration_seconds
      : transcriptDurationMs != null
        ? Math.round(transcriptDurationMs / 1000)
        : null

  const statusStyles: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
    processing: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    uploaded: "bg-sky-500/15 text-sky-200 border-sky-400/30",
    failed: "bg-red-500/15 text-red-200 border-red-400/30",
  }

  const st = summary?.status

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-1 gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-white/72 hover:bg-white/[0.08] hover:text-white"
        asChild
      >
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4" />
          All meetings
        </Link>
      </Button>

      <div className="workspace-card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-violet-500/18 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-0 h-52 w-52 rounded-full bg-cyan-400/14 blur-3xl" />

        <div className="relative space-y-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75">
                Meeting review
              </p>
              <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.04em] text-white md:text-4xl">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {hasEnrichedTranscript && (
                  <Badge className="gap-1 rounded-full border border-purple-400/35 bg-purple-500/20 text-purple-100">
                    <Sparkles className="h-3 w-3" />
                    Enriched
                  </Badge>
                )}
                {fromDiarization && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-cyan-400/30 bg-cyan-400/10 text-cyan-200/90"
                  >
                    Diarized
                  </Badge>
                )}
                {st && (
                  <Badge variant="outline" className={cn("rounded-full border", statusStyles[st] ?? "")}>
                    {st}
                  </Badge>
                )}
              </div>
              <p className="font-mono text-xs text-white/40">ID {meetingId}</p>
            </div>

            <dl className="grid w-full shrink-0 gap-3 sm:grid-cols-3 lg:max-w-2xl lg:gap-4">
              {recorded && (
                <div className="workspace-panel p-4">
                  <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                    <Calendar className="h-3.5 w-3.5 text-violet-300/80" />
                    Recorded
                  </dt>
                  <dd className="mt-3 text-sm font-medium leading-6 text-white/90">{recorded}</dd>
                </div>
              )}
              {durationSec != null && durationSec > 0 && (
                <div className="workspace-panel p-4">
                  <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                    <Clock3 className="h-3.5 w-3.5 text-cyan-300/80" />
                    Duration
                  </dt>
                  <dd className="mt-3 text-sm font-medium text-white/90">
                    {formatDurationSeconds(durationSec)}
                  </dd>
                </div>
              )}
              <div className="workspace-panel p-4">
                <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                  <Hash className="h-3.5 w-3.5 text-fuchsia-300/80" />
                  Lines
                </dt>
                <dd className="mt-3 text-sm font-medium text-white/90">{transcriptEntryCount}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
