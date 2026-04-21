"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, User, Users } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import type { ContactSummary, DealSummary } from "@/lib/api"

export default function ContactsPage() {
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<ContactSummary[]>([])
  const [deals, setDeals] = useState<DealSummary[]>([])
  const [dealFilter, setDealFilter] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [cs, ds] = await Promise.all([
          api.listContacts(dealFilter ? { deal_id: dealFilter } : {}),
          deals.length === 0 ? api.listDeals() : Promise.resolve({ deals, total: deals.length }),
        ])
        if (!cancelled) {
          setContacts(cs.contacts)
          setDeals(ds.deals)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load contacts")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, dealFilter])

  const dealById = new Map(deals.map((d) => [d.id, d]))

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
          <Users className="h-4 w-4 text-white/60" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-white">Contacts</h1>
          <p className="text-sm text-white/45">
            Everyone you&apos;ve met with, plus what you&apos;ve learned about them.
          </p>
        </div>
        {deals.length > 0 ? (
          <select
            value={dealFilter}
            onChange={(e) => setDealFilter(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white/80 outline-none hover:border-white/[0.15]"
          >
            <option value="">All deals</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <CoreSpinLoader />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-white/60">No contacts yet.</p>
          <p className="mt-1 text-xs text-white/40">
            Contacts appear once calendar events are synced.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
          {contacts.map((c) => {
            const deal = c.deal_id ? dealById.get(c.deal_id) : null
            return (
              <Link
                key={c.id}
                href={`/contacts/${c.id}`}
                className="group flex items-center gap-4 border-b border-white/[0.06] px-4 py-4 transition-colors last:border-0 hover:bg-white/[0.03] sm:px-6"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                  <User className="h-4 w-4 text-white/60" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {c.full_name || c.email}
                  </p>
                  {c.full_name ? (
                    <p className="truncate text-xs text-white/40">{c.email}</p>
                  ) : null}
                </div>
                {deal ? (
                  <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/55 sm:inline">
                    {deal.name}
                  </span>
                ) : null}
                <ArrowRight className="h-4 w-4 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
