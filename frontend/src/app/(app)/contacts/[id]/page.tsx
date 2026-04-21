"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Briefcase, User } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import type { ContactDetail, DealSummary, KnowledgeEntry } from "@/lib/api"
import { KnowledgeList } from "@/components/app/deals/KnowledgeList"

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ContactDetail | null>(null)
  const [deals, setDeals] = useState<DealSummary[]>([])
  const [dealSaving, setDealSaving] = useState(false)
  const [dealError, setDealError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [contactRes, dealsRes] = await Promise.all([
          api.getContact(id),
          api.listDeals(),
        ])
        if (!cancelled) {
          setData(contactRes)
          setDeals(dealsRes.deals)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load contact")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, id])

  const onDealChange = async (value: string) => {
    if (!id) return
    setDealError(null)
    setDealSaving(true)
    try {
      const next = value === "" ? null : value
      const updated = await api.updateContactDeal(id, { deal_id: next })
      setData(updated)
    } catch (e) {
      setDealError(e instanceof Error ? e.message : "Could not update deal")
    } finally {
      setDealSaving(false)
    }
  }

  const grouped = useMemo(() => {
    if (!data) return []
    const byMeeting = new Map<string, { meetingId: string; title?: string | null; date?: string | null; entries: KnowledgeEntry[] }>()
    for (const k of data.knowledge) {
      const bucket = byMeeting.get(k.meeting_id) ?? {
        meetingId: k.meeting_id,
        title: k.meeting_title,
        date: k.meeting_recorded_at,
        entries: [],
      }
      bucket.entries.push(k)
      byMeeting.set(k.meeting_id, bucket)
    }
    return Array.from(byMeeting.values()).sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const db = b.date ? new Date(b.date).getTime() : 0
      return db - da
    })
  }, [data])

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
        <Link href="/contacts" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to contacts
        </Link>
        <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          {error || "Contact not found"}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href="/contacts" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>

      <header className="mb-6 mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
            <User className="h-5 w-5 text-white/60" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">
              {data.full_name || data.email}
            </h1>
            <p className="truncate text-sm text-white/45">{data.email}</p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-64 sm:items-end">
          <label htmlFor="contact-deal" className="text-xs font-medium text-white/40">
            Deal
          </label>
          <select
            id="contact-deal"
            disabled={dealSaving}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-white/20 disabled:opacity-50"
            value={data.deal_id ?? ""}
            onChange={(e) => void onDealChange(e.target.value)}
          >
            <option value="">No deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.domain})
              </option>
            ))}
          </select>
          {data.deal_id ? (
            <Link
              href={`/deals/${data.deal_id}`}
              className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80"
            >
              <Briefcase className="h-3 w-3" />
              Open deal
            </Link>
          ) : null}
          {dealError ? (
            <p className="text-xs text-red-400">{dealError}</p>
          ) : null}
        </div>
      </header>

      <section className="space-y-5">
        {grouped.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-sm text-white/45">
            No knowledge extracted yet.
          </div>
        ) : (
          grouped.map((group) => (
            <div
              key={group.meetingId}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <Link
                  href={`/meetings/${group.meetingId}`}
                  className="text-sm font-medium text-white hover:underline"
                >
                  {group.title?.trim() || "Untitled meeting"}
                </Link>
                {group.date ? (
                  <span className="text-xs text-white/40">
                    {new Date(group.date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
              </div>
              <KnowledgeList entries={group.entries} />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
