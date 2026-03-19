"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { Video, MessageSquare, Clock, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/useApi"
import type { MeetingSummary } from "@/lib/api"

export default function DashboardPage() {
  const { user } = useUser()
  const api = useApi()
  const firstName = user?.firstName || "there"

  const [recentMeetings, setRecentMeetings] = useState<MeetingSummary[]>([])
  const [totalMeetings, setTotalMeetings] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await api.getMeetings({ limit: 5 })
        if (cancelled) return
        setRecentMeetings(data.meetings)
        setTotalMeetings(data.total)

        const totalSec = data.meetings.reduce(
          (sum, m) => sum + (m.duration_seconds || 0),
          0
        )
        setTotalDuration(totalSec)
      } catch {
        // API not available yet or user has no meetings
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [api])

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-white">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Here&apos;s an overview of your meeting activity.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total Meetings",
            value: loading ? "—" : String(totalMeetings),
            icon: Video,
          },
          {
            label: "Total Duration",
            value: loading ? "—" : formatDuration(totalDuration),
            icon: Clock,
          },
          {
            label: "Chat Messages",
            value: "—",
            icon: MessageSquare,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/[0.06] bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/[0.06] p-2">
                <stat.icon className="h-4 w-4 text-white/60" />
              </div>
              <div>
                <p className="text-xs text-white/40">{stat.label}</p>
                <p className="text-xl font-bold text-white">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/meetings"
          className="group flex items-center justify-between rounded-xl border border-white/[0.06] bg-card p-5 transition-colors hover:border-white/[0.12]"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2.5">
              <Video className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-white">View Meetings</p>
              <p className="text-xs text-white/40">
                Browse your transcribed meetings
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-white/20 transition-transform group-hover:translate-x-1 group-hover:text-white/40" />
        </Link>

        <Link
          href="/chat"
          className="group flex items-center justify-between rounded-xl border border-white/[0.06] bg-card p-5 transition-colors hover:border-white/[0.12]"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-500/10 p-2.5">
              <MessageSquare className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-white">Chat with AI</p>
              <p className="text-xs text-white/40">
                Ask questions and get AI-powered answers
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-white/20 transition-transform group-hover:translate-x-1 group-hover:text-white/40" />
        </Link>
      </div>

      {/* Recent meetings */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold text-white">
            Recent Meetings
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/meetings">
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="mt-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-white/[0.04]"
              />
            ))}
          </div>
        ) : recentMeetings.length === 0 ? (
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-card p-8 text-center">
            <Video className="mx-auto h-8 w-8 text-white/20" />
            <p className="mt-3 text-sm text-white/40">
              No meetings yet. Start a meeting in the desktop app to see it
              here.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {recentMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/meetings/${meeting.id}`}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-card p-4 transition-colors hover:border-white/[0.12]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/[0.06] p-2">
                    <Video className="h-4 w-4 text-white/50" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {meeting.title || "Untitled Meeting"}
                    </p>
                    <p className="text-xs text-white/40">
                      {meeting.recorded_at
                        ? new Date(meeting.recorded_at).toLocaleDateString()
                        : "—"}
                      {meeting.duration_seconds
                        ? ` · ${formatDuration(meeting.duration_seconds)}`
                        : ""}
                      {` · ${meeting.entry_count} entries`}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/20" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
