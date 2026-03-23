"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Video,
  type LucideIcon,
} from "lucide-react"
import { HeroSection } from "@/components/ui/hero-section-dark"
import { MeetingActivityCard } from "@/components/ui/meeting-activity-card"
import { LoadingDots } from "@/components/app/workspace/LoadingDots"
import { useApi } from "@/hooks/useApi"
import { formatDurationSeconds } from "@/lib/utils"
import type { DashboardStats, MeetingSummary } from "@/lib/api"

function formatHours(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  loading,
}: {
  label: string
  value: string
  subtitle: string
  icon: LucideIcon
  loading?: boolean
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/60">{label}</p>
        <Icon className="h-4 w-4 text-white/40" />
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded bg-white/[0.06]" />
      ) : (
        <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      )}
      <p className="mt-1 text-xs text-white/40">{subtitle}</p>
    </div>
  )
}

function RecentMeetingRow({ meeting }: { meeting: MeetingSummary }) {
  const dateStr = meeting.recorded_at
    ? new Date(meeting.recorded_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "No date"

  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="flex items-center gap-4 rounded-lg px-1 py-2 transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
        <Video className="h-4 w-4 text-white/60" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {meeting.title || "Untitled Meeting"}
        </p>
        <p className="text-xs text-white/40">{dateStr}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-white">
          {meeting.entry_count} lines
        </p>
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const { user } = useUser()
  const api = useApi()
  const firstName = user?.firstName || "there"

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getDashboardStats()
      setStats(data)
    } catch {
      // API unavailable
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const completionRate =
    stats && stats.total_meetings > 0
      ? Math.round((stats.completed_count / stats.total_meetings) * 100)
      : 0

  const activityData = (stats?.meetings_per_month ?? []).map((d) => d.count)

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Hero */}
      <div className="-mx-4 -mt-5 sm:-mx-6 lg:-mx-8 lg:-mt-8">
        <HeroSection
          className="rounded-none"
          title="Mission Control"
          subtitle={{
            regular: `Welcome back, ${firstName}. `,
            gradient: "Let's review your workspace.",
          }}
          description="Browse transcripts, chat with AI, and stay on top of follow-ups from a single, focused dashboard."
          ctaText="Browse meetings"
          ctaHref="/meetings"
          secondaryCtaText="Open AI chat"
          secondaryCtaHref="/chat"
          gridOptions={{
            angle: 65,
            opacity: 0.3,
            cellSize: 50,
            darkLineColor: "#1e1b4b",
          }}
        />
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Meetings"
          value={String(stats?.total_meetings ?? 0)}
          subtitle={`${stats?.completed_count ?? 0} completed, ${stats?.processing_count ?? 0} processing`}
          icon={Video}
          loading={loading}
        />
        <StatCard
          label="Hours Recorded"
          value={formatHours(stats?.total_duration_seconds ?? 0)}
          subtitle="Across all synced meetings"
          icon={Clock3}
          loading={loading}
        />
        <StatCard
          label="Transcript Lines"
          value={(stats?.total_transcript_lines ?? 0).toLocaleString()}
          subtitle={`~${Math.round((stats?.total_transcript_lines ?? 0) / Math.max(stats?.total_meetings ?? 1, 1))} avg per meeting`}
          icon={FileText}
          loading={loading}
        />
        <StatCard
          label="Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${stats?.completed_count ?? 0} of ${stats?.total_meetings ?? 0} fully processed`}
          icon={CheckCircle2}
          loading={loading}
        />
      </div>

      {/* Activity card + Recent meetings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <MeetingActivityCard
          className="lg:col-span-4"
          totalMeetings={stats?.total_meetings ?? 0}
          totalDurationSeconds={stats?.total_duration_seconds ?? 0}
          totalTranscriptLines={stats?.total_transcript_lines ?? 0}
          activityData={activityData}
          alertMessage={
            stats?.processing_count
              ? `${stats.processing_count} meeting${stats.processing_count > 1 ? "s" : ""} currently processing`
              : undefined
          }
          ctaText="Browse all meetings"
          ctaHref="/meetings"
          loading={loading}
        />

        {/* Recent meetings */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Recent Meetings</h3>
            <Link
              href="/meetings"
              className="inline-flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-1 text-sm text-white/40">
            {stats?.total_meetings
              ? `You have ${stats.total_meetings} meetings total.`
              : "Your recent meetings will appear here."}
          </p>

          {loading ? (
            <div className="mt-6 flex items-center justify-center py-12">
              <LoadingDots />
            </div>
          ) : !stats?.recent_meetings?.length ? (
            <div className="mt-6 flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Video className="h-8 w-8 text-white/20" />
              <p className="text-sm text-white/40">No meetings yet.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-1">
              {stats.recent_meetings.map((meeting) => (
                <RecentMeetingRow key={meeting.id} meeting={meeting} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
