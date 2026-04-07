"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Calendar, Check, Clock3, Copy, Hash, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { MeetingSummary } from "@/lib/api"
import { cn, formatDurationSeconds } from "@/lib/utils"

/** When API title is missing, avoid echoing the UUID in the main heading. */
function fallbackHeadingTitle(summary: MeetingSummary | null, createdAt: string | null): string {
  const raw =
    summary?.recorded_at != null ? summary.recorded_at : createdAt != null ? createdAt : null
  if (raw == null) return "Untitled meeting"
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return "Untitled meeting"
  const datePart = d.toLocaleDateString(undefined, { dateStyle: "medium" })
  return `Meeting · ${datePart}`
}

function CopyIdButton({ meetingId }: { meetingId: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meetingId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="group inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.06]"
    >
      <span className="font-mono text-[11px] text-white/45 tabular-nums sm:text-xs">
        {meetingId.slice(0, 8)}…{meetingId.slice(-4)}
      </span>
      {copied ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400/90">
          <Check className="h-3 w-3" />
          Copied
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] text-white/35 group-hover:text-white/55">
          <Copy className="h-3 w-3" />
          Copy
        </span>
      )}
    </button>
  )
}

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
  const trimmedTitle = summary?.title?.trim()
  const title =
    trimmedTitle && trimmedTitle.length > 0
      ? trimmedTitle
      : fallbackHeadingTitle(summary, createdAt)

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
    completed: "bg-emerald-500/12 text-emerald-200/95 ring-1 ring-emerald-400/25",
    processing: "bg-amber-500/12 text-amber-200/95 ring-1 ring-amber-400/25",
    uploaded: "bg-sky-500/12 text-sky-200/95 ring-1 ring-sky-400/25",
    failed: "bg-red-500/12 text-red-200/95 ring-1 ring-red-400/25",
  }

  const st = summary?.status

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-white/45 transition-colors hover:text-white/90"
      >
        <ArrowLeft className="h-4 w-4 shrink-0 opacity-80" />
        <span>All meetings</span>
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 100% -20%, rgba(139,92,246,0.22), transparent 50%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(34,211,238,0.12), transparent 45%)",
          }}
        />

        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
            <div className="min-w-0 flex-1 space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/38">
                Meeting review
              </p>
              <h1 className="font-display text-2xl font-semibold leading-[1.15] tracking-[-0.03em] text-white sm:text-3xl">
                {title}
              </h1>

              <div className="flex flex-wrap items-center gap-2">
                {hasEnrichedTranscript && (
                  <Badge className="gap-1 rounded-md border border-violet-400/25 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-100/95">
                    <Sparkles className="h-3 w-3" />
                    Enriched
                  </Badge>
                )}
                {fromDiarization && (
                  <Badge className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-100/90">
                    Diarized
                  </Badge>
                )}
                {st && (
                  <Badge
                    className={cn(
                      "rounded-md border-0 px-2 py-0.5 text-[11px] font-medium capitalize",
                      statusStyles[st] ?? "bg-white/10 text-white/80 ring-1 ring-white/15"
                    )}
                  >
                    {st}
                  </Badge>
                )}
              </div>

              <div className="pt-1">
                <CopyIdButton meetingId={meetingId} />
              </div>
            </div>

            {/* Stats — single row, icon + label + value */}
            <dl className="grid w-full shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:max-w-2xl">
              {recorded && (
                <div className="flex gap-3 rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3.5 ring-1 ring-inset ring-white/[0.04]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                    <Calendar className="h-4 w-4 text-violet-300/85" />
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
                      Recorded
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-snug text-white/90">{recorded}</dd>
                  </div>
                </div>
              )}
              {durationSec != null && durationSec > 0 && (
                <div className="flex gap-3 rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3.5 ring-1 ring-inset ring-white/[0.04]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                    <Clock3 className="h-4 w-4 text-cyan-300/85" />
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
                      Duration
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums text-white/90">
                      {formatDurationSeconds(durationSec)}
                    </dd>
                  </div>
                </div>
              )}
              <div className="flex gap-3 rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3.5 ring-1 ring-inset ring-white/[0.04]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                  <Hash className="h-4 w-4 text-fuchsia-300/80" />
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
                    Lines
                  </dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-white/90">{transcriptEntryCount}</dd>
                </div>
              </div>
            </dl>
          </div>
        </div>
      </header>
    </div>
  )
}
