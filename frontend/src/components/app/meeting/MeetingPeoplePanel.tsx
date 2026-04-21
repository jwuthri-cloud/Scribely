"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Briefcase, Users } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import type { MeetingKnowledgeResponse } from "@/lib/api"
import { WorkspaceSurface } from "@/components/app/workspace/WorkspaceSurface"

const categoryColors: Record<string, string> = {
  role: "bg-sky-500/15 text-sky-300",
  preference: "bg-violet-500/15 text-violet-300",
  pain_point: "bg-rose-500/15 text-rose-300",
  goal: "bg-emerald-500/15 text-emerald-300",
  personal: "bg-amber-500/15 text-amber-300",
  other: "bg-white/10 text-white/60",
}

export function MeetingPeoplePanel({ meetingId }: { meetingId: string }) {
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MeetingKnowledgeResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.getMeetingKnowledge(meetingId)
        if (!cancelled) setData(res)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, meetingId])

  if (loading) return null
  if (!data || (!data.deal && data.entries.length === 0)) return null

  const byContact = new Map<string, typeof data.entries>()
  for (const e of data.entries) {
    const key = e.contact_id
    const arr = byContact.get(key) ?? []
    arr.push(e)
    byContact.set(key, arr)
  }

  return (
    <WorkspaceSurface variant="panel" className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-white/35" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
          People &amp; Deal
        </h2>
      </div>

      {data.deal ? (
        <Link
          href={`/deals/${data.deal.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/75 hover:bg-white/[0.1]"
        >
          <Briefcase className="h-3 w-3" />
          {data.deal.name}
          <span className="text-white/40">· {data.deal.domain}</span>
        </Link>
      ) : (
        <p className="text-xs text-white/35">No deal detected for this meeting.</p>
      )}

      {byContact.size === 0 ? (
        <p className="text-sm text-white/40">
          No per-contact knowledge was extracted from this meeting.
        </p>
      ) : (
        <ul className="space-y-3">
          {Array.from(byContact.entries()).map(([contactId, entries]) => (
            <li key={contactId} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <Link
                href={`/contacts/${contactId}`}
                className="text-sm font-medium text-white/90 hover:underline"
              >
                {entries[0].contact_name || entries[0].contact_email || "Unknown"}
              </Link>
              <ul className="mt-2 space-y-1.5">
                {entries.map((e) => (
                  <li key={e.id} className="flex gap-2 text-sm text-white/80">
                    <span
                      className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        categoryColors[e.category] ?? categoryColors.other
                      }`}
                    >
                      {e.category.replace(/_/g, " ")}
                    </span>
                    <span>{e.fact}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSurface>
  )
}
