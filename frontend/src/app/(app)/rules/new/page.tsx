"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Edge, Node } from "@xyflow/react"
import { useApi } from "@/hooks/useApi"
import { RuleFlowCanvas, type RuleFlowCanvasHandle } from "@/components/app/rules/flow/RuleFlowCanvas"
import { initialNewRuleFlow } from "@/components/app/rules/flow/rule-flow-utils"
import { RULE_TEMPLATES } from "@/components/app/rules/rule-templates"
import { cn } from "@/lib/utils"

export default function NewRulePage() {
  const api = useApi()
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const flowRef = useRef<RuleFlowCanvasHandle>(null)
  const [flowKey, setFlowKey] = useState(0)
  const [flowSeed, setFlowSeed] = useState<{ nodes: Node[]; edges: Edge[] }>(() => initialNewRuleFlow())

  function applyTemplate(templateId: string) {
    const t = RULE_TEMPLATES.find((x) => x.id === templateId)
    if (!t) return
    setName(t.suggestedName)
    setDescription(t.suggestedDescription)
    setFlowSeed(t.buildFlow())
    setFlowKey((k) => k + 1)
    setErr(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!name.trim()) {
      setErr("Name is required")
      return
    }
    const payload = flowRef.current?.getSavePayload()
    if (!payload) {
      setErr("Flow editor is not ready.")
      return
    }
    if (payload.error) {
      setErr(payload.error)
      return
    }
    if (payload.steps.length === 0) {
      setErr("Add at least one step node and connect it from the trigger.")
      return
    }
    const flow = flowRef.current
    if (!flow) {
      setErr("Flow editor is not ready.")
      return
    }
    const trigger = flow.getTrigger()
    setSaving(true)
    try {
      const created = await api.createRule({
        name: name.trim(),
        description: description.trim() || null,
        trigger,
        enabled: true,
        steps: payload.steps,
        flow_layout: payload.flow_layout,
      })
      router.push(`/rules/${created.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 pb-12">
      <Link
        href="/rules"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white/70"
      >
        <ArrowLeft className="h-4 w-4" />
        Rules
      </Link>

      <h1 className="text-xl font-semibold text-white">New rule</h1>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
        <p className="text-xs font-medium text-white/50">Start from a template</p>
        <p className="mt-1 text-[11px] text-white/35">
          Fills name, description, and the flow. You can edit everything before saving.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {RULE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              className={cn(
                "rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left transition",
                "hover:border-violet-500/35 hover:bg-violet-500/10"
              )}
            >
              <span className="text-[13px] font-medium text-white/90">{t.title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-white/45">{t.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={(e) => void submit(e)} className="w-full min-w-0 space-y-6">
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
          <p className="text-xs text-white/40">
            Set <span className="text-white/55">when this rule runs</span> using the{" "}
            <span className="text-amber-200/80">Trigger</span> node on the canvas below.
          </p>
        </div>

        <div className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-white">Flow</h2>
          <RuleFlowCanvas
            key={flowKey}
            ref={flowRef}
            initialNodes={flowSeed.nodes}
            initialEdges={flowSeed.edges}
          />
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
