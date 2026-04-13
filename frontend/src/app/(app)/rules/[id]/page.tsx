"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Trash2, Play } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import type { MeetingRule, RuleExecutionDTO } from "@/lib/api"
import { PromptOptimizerChat } from "@/components/app/rules/PromptOptimizerChat"
import { RuleFlowCanvas, type RuleFlowCanvasHandle } from "@/components/app/rules/flow/RuleFlowCanvas"
import { buildFlowFromRule } from "@/components/app/rules/flow/rule-flow-utils"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"
import type { Edge, Node } from "@xyflow/react"

export default function EditRulePage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""
  const api = useApi()
  const router = useRouter()

  const [rule, setRule] = useState<MeetingRule | null>(null)
  const [flowKey, setFlowKey] = useState(0)
  const flowRef = useRef<RuleFlowCanvasHandle>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [executions, setExecutions] = useState<RuleExecutionDTO[]>([])
  const [testMeetingId, setTestMeetingId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErr(null)
    try {
      const [r, ex] = await Promise.all([api.getRule(id), api.listRuleExecutions(id)])
      setRule(r)
      setName(r.name)
      setDescription(r.description ?? "")
      setFlowKey((k) => k + 1)
      setExecutions(ex)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [api, id])

  useEffect(() => {
    void load()
  }, [load])

  const flowInitial = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    if (!rule) return { nodes: [], edges: [] }
    return buildFlowFromRule(rule)
  }, [rule, flowKey])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !name.trim() || !rule) return
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
    const nextTrigger = flow.getTrigger()
    setSaving(true)
    setErr(null)
    try {
      const updated = await api.updateRule(id, {
        name: name.trim(),
        description: description.trim() || null,
        trigger: nextTrigger,
        enabled: rule.enabled,
        steps: payload.steps,
        flow_layout: payload.flow_layout,
      })
      setRule(updated)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!id || !confirm("Delete this rule?")) return
    try {
      await api.deleteRule(id)
      router.push("/rules")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed")
    }
  }

  async function test() {
    if (!id || !testMeetingId.trim()) return
    setTesting(true)
    setErr(null)
    try {
      await api.testRule(id, testMeetingId.trim())
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Test failed")
    } finally {
      setTesting(false)
    }
  }

  const applyOptimizedPrompt = (text: string) => {
    flowRef.current?.applyPromptToFirstLlm(text)
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <CoreSpinLoader showText={false} className="min-h-[160px]" />
      </div>
    )
  }

  if (!rule) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="text-red-400">{err || "Rule not found"}</p>
        <Link href="/rules" className="mt-4 inline-block text-sm text-white/60 hover:text-white">
          Back to rules
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8 pb-12">
      <Link href="/rules" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-white/70">
        <ArrowLeft className="h-4 w-4" />
        Rules
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-xl font-semibold text-white">Edit rule</h1>
        <button
          type="button"
          onClick={() => void remove()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-red-500/20 px-3 py-2 text-sm text-red-400/90 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>

      <form onSubmit={(e) => void save(e)} className="w-full min-w-0 space-y-6">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white"
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
            Choose <span className="text-white/55">when this rule runs</span> on the{" "}
            <span className="text-amber-200/80">Trigger</span> node in the flow below. Enable or disable this rule from
            the rules list.
          </p>
        </div>

        <div className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-white">Flow</h2>
          {rule && (
            <RuleFlowCanvas
              key={flowKey}
              ref={flowRef}
              initialNodes={flowInitial.nodes}
              initialEdges={flowInitial.edges}
            />
          )}
        </div>

        <PromptOptimizerChat
          currentPrompt=""
          getCurrentPrompt={() => flowRef.current?.getFirstLlmPrompt() ?? ""}
          onApply={applyOptimizedPrompt}
        />

        {err && <p className="text-sm text-red-400">{err}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-white/[0.1] px-6 py-2.5 text-sm font-medium text-white hover:bg-white/[0.14] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h2 className="text-sm font-semibold text-white">Test run</h2>
        <p className="mt-1 text-xs text-white/45">Execute this rule once against a meeting you own.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={testMeetingId}
            onChange={(e) => setTestMeetingId(e.target.value)}
            placeholder="Meeting ID"
            className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 font-mono text-sm text-white"
          />
          <button
            type="button"
            disabled={testing || !testMeetingId.trim()}
            onClick={() => void test()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300/95 hover:bg-emerald-500/25 disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Run test
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h2 className="text-sm font-semibold text-white">Recent runs</h2>
        <ul className="mt-3 space-y-2 text-xs text-white/60">
          {executions.length === 0 && <li>No executions yet.</li>}
          {executions.map((ex) => (
            <li key={ex.id} className="rounded-lg border border-white/[0.06] px-3 py-2 font-mono">
              <span className="text-white/80">{ex.status}</span> · meeting {ex.meeting_id.slice(0, 8)}… ·{" "}
              {ex.started_at ?? "—"}
              {ex.error && <span className="ml-2 text-red-400/90">{ex.error}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
