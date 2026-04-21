"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Briefcase, Users, Video } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import type { DealDetail } from "@/lib/api"
import { KnowledgeList } from "@/components/app/deals/KnowledgeList"

export default function DealDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DealDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.getDeal(id)
        if (!cancelled) setData(res)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load deal")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <CoreSpinLoader />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/deals" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to deals
        </Link>
        <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          {error || "Deal not found"}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/deals" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Deals
      </Link>

      <header className="mb-6 mt-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
          <Briefcase className="h-5 w-5 text-white/60" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">{data.name}</h1>
          <p className="text-sm text-white/45">{data.domain}</p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/45">
            <Users className="h-3.5 w-3.5" /> Contacts ({data.contacts.length})
          </h2>
          {data.contacts.length === 0 ? (
            <p className="text-sm text-white/40">No contacts yet.</p>
          ) : (
            <ul className="space-y-1">
              {data.contacts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-white/75 hover:bg-white/[0.04]"
                  >
                    <span className="truncate">
                      {c.full_name || c.email}
                      {c.full_name && (
                        <span className="ml-1 text-xs text-white/35">{c.email}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/45">
            <Video className="h-3.5 w-3.5" /> Recent meetings ({data.recent_meetings.length})
          </h2>
          {data.recent_meetings.length === 0 ? (
            <p className="text-sm text-white/40">No meetings yet.</p>
          ) : (
            <ul className="space-y-1">
              {data.recent_meetings.slice(0, 10).map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/meetings/${m.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-white/75 hover:bg-white/[0.04]"
                  >
                    <span className="truncate">{m.title || "Untitled meeting"}</span>
                    <span className="ml-3 shrink-0 text-[11px] text-white/35">
                      {m.recorded_at
                        ? new Date(m.recorded_at).toLocaleDateString()
                        : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/45">
          Knowledge ({data.knowledge.length})
        </h2>
        <KnowledgeList entries={data.knowledge} showContact />
      </section>
    </div>
  )
}
