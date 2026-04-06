"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import type { CalendarEventDetail } from "@/lib/api"

export default function CalendarEventDetailPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""
  const api = useApi()
  const [event, setEvent] = useState<CalendarEventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getCalendarEvent(id)
      setEvent(data)
    } catch {
      setError("Event not found")
      setEvent(null)
    } finally {
      setLoading(false)
    }
  }, [api, id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <CoreSpinLoader />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <p className="text-white/60">{error || "Not found"}</p>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to calendar
        </Link>
      </div>
    )
  }

  const start = new Date(event.start_time)
  const end = new Date(event.end_time)

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link
        href="/calendar"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition-colors hover:text-white/75"
      >
        <ArrowLeft className="h-4 w-4" />
        Calendar
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {event.title || "(No title)"}
        </h1>
        <p className="mt-2 text-sm text-white/45">
          {start.toLocaleString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          – {end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>
        {event.meeting_url && (
          <a
            href={event.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.1] px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.14]"
          >
            Join meeting
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {event.description && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-white/40">Description</h2>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-white/65">{event.description}</pre>
        </div>
      )}

      <div>
        <h2 className="text-xs font-medium uppercase tracking-wider text-white/40">Participants</h2>
        <ul className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
          {event.participants.length === 0 ? (
            <li className="px-4 py-3 text-sm text-white/40">No attendee list on this event.</li>
          ) : (
            event.participants.map((p) => (
              <li key={p.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-white/85">{p.display_name || p.email}</span>
                <span className="text-xs text-white/40">{p.email}</span>
                <span className="w-full text-xs text-white/35 sm:w-auto">{p.response_status}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
