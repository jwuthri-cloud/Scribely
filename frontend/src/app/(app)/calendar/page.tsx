"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  CalendarDays,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  Unplug,
  AlertCircle,
} from "lucide-react"
import { useClerk } from "@clerk/nextjs"
import { useApi } from "@/hooks/useApi"
import { clerkAdditionalGoogleCalendarScopes } from "@/lib/clerk-google-calendar"
import { CalendarEventCard } from "@/components/app/calendar/CalendarEventCard"
import { MeetingPushOptIn } from "@/components/app/calendar/MeetingPushOptIn"
import { NextMeetingBanner } from "@/components/app/calendar/NextMeetingBanner"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import { ApiError, type CalendarConnectionStatus, type CalendarEventSummary } from "@/lib/api"

export default function CalendarPage() {
  const { openUserProfile } = useClerk()
  const api = useApi()
  const [status, setStatus] = useState<CalendarConnectionStatus | null>(null)
  const [events, setEvents] = useState<CalendarEventSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await api.getCalendarStatus()
      setStatus(s)
      if (s.connected) {
        const upcoming = await api.getUpcomingCalendarEvents(50)
        setEvents(upcoming)
      } else {
        setEvents([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar")
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const connect = async () => {
    setActionLoading(true)
    setError(null)
    try {
      await api.connectCalendar()
      await load()
    } catch (e) {
      let msg = "Could not connect calendar. Ensure Google sign-in includes Calendar scope."
      if (e instanceof ApiError) {
        try {
          const j = JSON.parse(e.message) as { detail?: unknown }
          if (typeof j.detail === "string") msg = j.detail
          else msg = e.message
        } catch {
          msg = e.message || msg
        }
      }
      setError(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const disconnect = async () => {
    if (!confirm("Disconnect Google Calendar? Synced events will remain until you reconnect.")) return
    setActionLoading(true)
    setError(null)
    try {
      await api.disconnectCalendar()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed")
    } finally {
      setActionLoading(false)
    }
  }

  const sync = async () => {
    setActionLoading(true)
    setError(null)
    try {
      await api.syncCalendar()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setActionLoading(false)
    }
  }

  if (loading && !status) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <CoreSpinLoader />
      </div>
    )
  }

  const connected = status?.connected ?? false

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-white/50">
          <CalendarDays className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Schedule</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Calendar</h1>
        <p className="mt-1 text-sm text-white/45">
          Upcoming meetings from Google Calendar. Connect once to sync and receive updates.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200/90">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 break-words">{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        {!connected ? (
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06]">
              <Plug className="h-7 w-7 text-white/50" />
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="text-lg font-medium text-white">Connect Google Calendar</h2>
              <p className="text-sm text-white/45">
                We use your existing Google sign-in (Clerk) with the Calendar read scope. If you
                skipped that permission at signup, click{" "}
                <span className="text-white/60">Grant Calendar in account settings</span> below,
                then in the profile modal go to <span className="text-white/60">Connected accounts</span>{" "}
                and reconnect Google so Google prompts for Calendar access. Then try Connect again.
                Alternatively, sign out and sign back in with Google after your project includes the
                Calendar scope (Clerk Dashboard → Google → Authorized scopes, plus Google Cloud OAuth
                consent screen).
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={connect}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.1] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.14] disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                  Connect Google Calendar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openUserProfile({
                      additionalOAuthScopes: clerkAdditionalGoogleCalendarScopes,
                    })
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-transparent px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  Grant Calendar in account settings
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-300/90">Connected</p>
                <p className="mt-0.5 text-xs text-white/40">
                  Last sync:{" "}
                  {status?.last_synced_at
                    ? new Date(status.last_synced_at).toLocaleString()
                    : "—"}
                  {status?.webhook_expires_at && (
                    <span className="ml-2">
                      · Push renews before{" "}
                      {new Date(status.webhook_expires_at).toLocaleDateString()}
                    </span>
                  )}
                </p>
                {status?.last_error && (
                  <p className="mt-1 text-xs text-amber-300/80">Warning: {status.last_error}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sync}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${actionLoading ? "animate-spin" : ""}`} />
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-white/50 hover:bg-white/[0.04] hover:text-white/70 disabled:opacity-50"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            </div>
            <div className="mt-6 border-t border-white/[0.06] pt-6">
              <MeetingPushOptIn />
            </div>
          </div>
        )}
      </div>

      {connected && (
        <div>
          <NextMeetingBanner events={events} />
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-white/40">
            Upcoming
          </h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <CoreSpinLoader />
            </div>
          ) : events.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/[0.08] py-12 text-center text-sm text-white/35">
              No upcoming events in the synced window. Try &quot;Sync now&quot; or add events in
              Google Calendar.
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <CalendarEventCard key={ev.id} event={ev} />
              ))}
            </div>
          )}
          <p className="mt-6 text-center text-xs text-white/30">
            Recorded meetings live under{" "}
            <Link href="/meetings" className="text-white/50 underline hover:text-white/70">
              Meetings
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  )
}
