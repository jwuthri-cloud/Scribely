"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Workflow, ChevronRight } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import type { MeetingRule } from "@/lib/api"
import { RuleEnabledToggle } from "@/components/app/rules/RuleEnabledToggle"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"

const triggerLabel: Record<string, string> = {
  before_meeting: "Before meeting",
  after_meeting: "After meeting",
  during_meeting: "During meeting",
}

export default function RulesPage() {
  const api = useApi()
  const [rules, setRules] = useState<MeetingRule[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.listRules()
        if (!cancelled) {
          setRules(data)
          setErr(null)
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load rules")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  const setRuleEnabled = useCallback(
    async (rule: MeetingRule, next: boolean) => {
      setActionErr(null)
      setBusyId(rule.id)
      try {
        await api.updateRule(rule.id, { enabled: next })
        setRules((prev) =>
          prev ? prev.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)) : prev
        )
      } catch (e) {
        setActionErr(e instanceof Error ? e.message : "Could not update rule")
      } finally {
        setBusyId(null)
      }
    },
    [api]
  )

  if (rules === null && !err) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <CoreSpinLoader showText={false} className="min-h-[160px]" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Meeting rules</h1>
          <p className="mt-1 text-sm text-white/45">
            Automate prompts, email, webhooks, and integrations before or after each meeting.
          </p>
        </div>
        <Link
          href="/rules/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.12]"
        >
          <Plus className="h-4 w-4" />
          New rule
        </Link>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div>
      )}
      {actionErr && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/95">
          {actionErr}
        </div>
      )}

      {rules && rules.length === 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
          <Workflow className="mx-auto h-10 w-10 text-white/25" />
          <p className="mt-4 text-sm text-white/50">No rules yet. Create one to run actions when meetings sync or finish processing.</p>
          <Link
            href="/rules/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/[0.1] px-4 py-2 text-sm text-white/80 hover:bg-white/[0.04]"
          >
            Create your first rule
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {rules && rules.length > 0 && (
        <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {rules.map((r) => (
            <li key={r.id} className="flex items-stretch">
              <Link
                href={`/rules/${r.id}`}
                className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                  <Workflow className="h-5 w-5 text-white/50" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{r.name}</p>
                  <p className="mt-0.5 text-xs text-white/40">
                    {triggerLabel[r.trigger] ?? r.trigger} · {r.steps.length} step{r.steps.length === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
              </Link>
              <div className="flex shrink-0 items-center border-l border-white/[0.06] px-3 sm:px-4">
                <RuleEnabledToggle
                  variant="inline"
                  enabled={r.enabled}
                  disabled={busyId === r.id}
                  onChange={(next) => void setRuleEnabled(r, next)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
