"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Briefcase, Users, Video, ArrowRight } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import type { DealSummary } from "@/lib/api"

export default function DealsPage() {
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState<DealSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.listDeals()
        if (!cancelled) setDeals(res.deals)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load deals")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
          <Briefcase className="h-4 w-4 text-white/60" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Deals</h1>
          <p className="text-sm text-white/45">
            Auto-detected from meeting participant domains.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <CoreSpinLoader />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-white/60">No deals yet.</p>
          <p className="mt-1 text-xs text-white/40">
            Deals are created automatically from calendar meetings with external participants.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
          {deals.map((d) => (
            <Link
              key={d.id}
              href={`/deals/${d.id}`}
              className="group flex items-center gap-4 border-b border-white/[0.06] px-4 py-4 transition-colors last:border-0 hover:bg-white/[0.03] sm:px-6"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                <Briefcase className="h-4 w-4 text-white/60" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{d.name}</p>
                <p className="text-xs text-white/40">{d.domain}</p>
              </div>
              <div className="hidden shrink-0 items-center gap-4 text-xs text-white/40 sm:flex">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {d.contact_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Video className="h-3 w-3" />
                  {d.meeting_count}
                </span>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
