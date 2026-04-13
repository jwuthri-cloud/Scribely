"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import type { RuleTrigger } from "@/lib/api"
import { RuleStepBuilder } from "@/components/app/rules/RuleStepBuilder"
import { newStepDraft, type StepDraft } from "@/components/app/rules/StepConfigForm"

export default function NewRulePage() {
  const api = useApi()
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [trigger, setTrigger] = useState<RuleTrigger>("after_meeting")
  const [enabled, setEnabled] = useState(true)
  const [steps, setSteps] = useState<StepDraft[]>([newStepDraft(0)])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!name.trim()) {
      setErr("Name is required")
      return
    }
    setSaving(true)
    try {
      const created = await api.createRule({
        name: name.trim(),
        description: description.trim() || null,
        trigger,
        enabled,
        steps: steps.map((s, i) => ({
          order_index: i,
          name: s.name,
          step_type: s.step_type,
          config: s.config,
        })),
      })
      router.push(`/rules/${created.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <Link
        href="/rules"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white/70"
      >
        <ArrowLeft className="h-4 w-4" />
        Rules
      </Link>

      <h1 className="text-xl font-semibold text-white">New rule</h1>

      <form onSubmit={(e) => void submit(e)} className="space-y-6">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white"
              placeholder="e.g. Post-meeting summary email"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">When to run</label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as RuleTrigger)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white"
              >
                <option value="before_meeting">Before meeting (on upload)</option>
                <option value="after_meeting">After meeting (when processing completes)</option>
                <option value="during_meeting">During meeting (reserved)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-white/20"
                />
                Enabled
              </label>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Steps</h2>
          <RuleStepBuilder steps={steps} onChange={setSteps} />
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-white/[0.1] px-6 py-2.5 text-sm font-medium text-white hover:bg-white/[0.14] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create rule"}
        </button>
      </form>
    </div>
  )
}
