import type { Edge, Node } from "@xyflow/react"
import type { MeetingRule, RuleStepDTO, RuleTrigger } from "@/lib/api"
import { newStepDraft, type StepDraft } from "@/components/app/rules/StepConfigForm"
import { RULE_TRIGGER_NODE_ID } from "./constants"

export const TRIGGER_LABEL: Record<RuleTrigger, string> = {
  before_meeting: "Before meeting",
  after_meeting: "After meeting",
  during_meeting: "During meeting",
}

/** React Flow data for the fixed trigger node — persisted in flow_layout JSON */
export type TriggerNodeData = {
  trigger: RuleTrigger
  label: string
}

export type RuleStepNodeData = {
  name: string
  step_type: StepDraft["step_type"]
  config: Record<string, unknown>
}

function buildOutgoing(edges: Edge[]): Map<string, string[]> {
  const outgoing = new Map<string, string[]>()
  for (const e of edges) {
    const arr = outgoing.get(e.source) ?? []
    arr.push(e.target)
    outgoing.set(e.source, Array.from(new Set(arr)))
  }
  return outgoing
}

/** Step ids reachable from the trigger via edges (BFS). */
export function reachableStepIdsFromEdges(edges: Edge[], stepIds: Set<string>): Set<string> {
  const outgoing = buildOutgoing(edges)
  const reachable = new Set<string>()
  const q: string[] = [RULE_TRIGGER_NODE_ID]
  const seen = new Set<string>([RULE_TRIGGER_NODE_ID])
  while (q.length) {
    const u = q.shift()!
    for (const v of outgoing.get(u) ?? []) {
      if (v === RULE_TRIGGER_NODE_ID) continue
      if (stepIds.has(v)) reachable.add(v)
      if (stepIds.has(v) && !seen.has(v)) {
        seen.add(v)
        q.push(v)
      }
    }
  }
  return reachable
}

/**
 * Kahn topological order of step ids reachable from the trigger.
 * Deterministic tie-break (lexicographic id). Returns error on cycle.
 */
export function topoOrderFromEdges(edges: Edge[], stepIds: Set<string>): { order: string[]; error: string | null } {
  const reachable = reachableStepIdsFromEdges(edges, stepIds)
  if (reachable.size === 0) {
    return { order: [], error: null }
  }

  const outgoing = buildOutgoing(edges)
  const nodes = new Set<string>([RULE_TRIGGER_NODE_ID, ...Array.from(reachable)])
  const inDegree = new Map<string, number>()
  for (const n of Array.from(nodes)) inDegree.set(n, 0)

  for (const u of Array.from(nodes)) {
    for (const v of outgoing.get(u) ?? []) {
      if (v === RULE_TRIGGER_NODE_ID) continue
      if (nodes.has(v)) {
        inDegree.set(v, (inDegree.get(v) ?? 0) + 1)
      }
    }
  }

  const heap: string[] = []
  for (const n of Array.from(nodes)) {
    if ((inDegree.get(n) ?? 0) === 0) heap.push(n)
  }
  heap.sort()

  const order: string[] = []
  let popped = 0
  while (heap.length) {
    const u = heap.shift()!
    popped++
    if (reachable.has(u)) order.push(u)
    for (const v of outgoing.get(u) ?? []) {
      if (v === RULE_TRIGGER_NODE_ID || !nodes.has(v)) continue
      const next = (inDegree.get(v) ?? 0) - 1
      inDegree.set(v, next)
      if (next === 0) {
        heap.push(v)
        heap.sort()
      }
    }
  }

  if (popped !== nodes.size) {
    return { order: [], error: "Cycle detected in flow — remove a connection to fix." }
  }
  if (order.length !== reachable.size) {
    return { order: [], error: "Cycle detected in flow — remove a connection to fix." }
  }

  return { order, error: null }
}

function isRuleTrigger(v: unknown): v is RuleTrigger {
  return v === "before_meeting" || v === "after_meeting" || v === "during_meeting"
}

/** Ensure trigger node has canonical data.trigger, label, and is not deletable. */
export function normalizeTriggerNode(node: Node, fallbackTrigger: RuleTrigger): Node {
  if (node.id !== RULE_TRIGGER_NODE_ID || node.type !== "trigger") return node
  const d = (node.data ?? {}) as Record<string, unknown>
  const trigger: RuleTrigger = isRuleTrigger(d.trigger) ? d.trigger : fallbackTrigger
  const label =
    typeof d.label === "string" && d.label.trim()
      ? d.label
      : TRIGGER_LABEL[trigger]
  return {
    ...node,
    deletable: false,
    data: { ...node.data, trigger, label } satisfies TriggerNodeData,
  }
}

export function hydrateFlowTriggerNodes(nodes: Node[], fallbackTrigger: RuleTrigger): Node[] {
  return nodes.map((n) => normalizeTriggerNode(n, fallbackTrigger))
}

/** Build React Flow state from API rule (saved graph or synthesized chain). */
export function buildFlowFromRule(rule: MeetingRule): { nodes: Node[]; edges: Edge[] } {
  const fl = rule.flow_layout
  if (
    fl &&
    typeof fl === "object" &&
    Array.isArray((fl as { nodes?: unknown }).nodes) &&
    ((fl as { nodes: unknown[] }).nodes?.length ?? 0) > 0
  ) {
    const rawNodes = (fl as { nodes: Node[] }).nodes
    const edges = Array.isArray((fl as { edges?: Edge[] }).edges) ? (fl as { edges: Edge[] }).edges : []
    return {
      nodes: hydrateFlowTriggerNodes(rawNodes, rule.trigger as RuleTrigger),
      edges,
    }
  }
  return synthesizeChain(rule.steps, rule.trigger as RuleTrigger)
}

/** Horizontal chain: trigger → steps in order_index order (legacy / fallback layout). */
export function synthesizeChain(steps: RuleStepDTO[], trigger: string): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...steps].sort((a, b) => a.order_index - b.order_index)
  const tr: RuleTrigger = isRuleTrigger(trigger) ? trigger : "after_meeting"
  const label = TRIGGER_LABEL[tr] ?? String(trigger).replace(/_/g, " ")
  const nodes: Node[] = [
    {
      id: RULE_TRIGGER_NODE_ID,
      type: "trigger",
      position: { x: 0, y: 100 },
      deletable: false,
      data: { trigger: tr, label } satisfies TriggerNodeData,
    },
  ]
  const edges: Edge[] = []
  let prev = RULE_TRIGGER_NODE_ID
  sorted.forEach((s, i) => {
    nodes.push({
      id: s.id,
      type: "ruleStep",
      position: { x: 260 + i * 260, y: 60 },
      data: {
        name: s.name,
        step_type: s.step_type as StepDraft["step_type"],
        config: { ...s.config },
      } satisfies RuleStepNodeData,
    })
    edges.push({
      id: `e-${prev}-${s.id}`,
      source: prev,
      target: s.id,
    })
    prev = s.id
  })
  return { nodes, edges }
}

/** New rule: trigger + one step, not auto-wired. */
export function initialNewRuleFlow(trigger: RuleTrigger = "after_meeting"): { nodes: Node[]; edges: Edge[] } {
  const draft = newStepDraft(0)
  if (!draft.id) {
    draft.id =
      typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID
        ? globalThis.crypto.randomUUID()
        : `step-${Date.now()}`
  }
  const label = TRIGGER_LABEL[trigger] ?? trigger.replace(/_/g, " ")
  return {
    nodes: [
      {
        id: RULE_TRIGGER_NODE_ID,
        type: "trigger",
        position: { x: 80, y: 140 },
        deletable: false,
        data: { trigger, label } satisfies TriggerNodeData,
      },
      {
        id: draft.id!,
        type: "ruleStep",
        position: { x: 420, y: 120 },
        data: {
          name: draft.name,
          step_type: draft.step_type,
          config: { ...draft.config },
        } satisfies RuleStepNodeData,
      },
    ],
    edges: [],
  }
}

export type FlowToStepDraftsResult = {
  drafts: StepDraft[]
  error: string | null
  /** Step nodes on canvas with no path from trigger (saved after reachable, higher order_index). */
  orphanIds: string[]
}

/** Convert graph to step payloads: topo order for wired steps, then orphans (by id). */
export function flowToStepDrafts(nodes: Node[], edges: Edge[]): FlowToStepDraftsResult {
  const stepNodes = nodes.filter((n) => n.type === "ruleStep")
  const stepIds = new Set(stepNodes.map((n) => n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const { order: topoIds, error } = topoOrderFromEdges(edges, stepIds)
  if (error) {
    return { drafts: [], error, orphanIds: [] }
  }

  const reachable = reachableStepIdsFromEdges(edges, stepIds)
  const orphanIds = stepNodes.map((n) => n.id).filter((id) => !reachable.has(id))
  orphanIds.sort()

  const drafts: StepDraft[] = []
  let idx = 0
  for (const id of topoIds) {
    const n = byId.get(id)
    if (!n || n.type !== "ruleStep") continue
    const d = n.data as RuleStepNodeData
    drafts.push({
      id,
      order_index: idx++,
      name: d.name,
      step_type: d.step_type,
      config: { ...d.config },
    })
  }
  for (const id of orphanIds) {
    const n = byId.get(id)
    if (!n || n.type !== "ruleStep") continue
    const d = n.data as RuleStepNodeData
    drafts.push({
      id,
      order_index: idx++,
      name: d.name,
      step_type: d.step_type,
      config: { ...d.config },
    })
  }

  return { drafts, error: null, orphanIds }
}

export function flowLayoutSnapshot(nodes: Node[], edges: Edge[]): Record<string, unknown> {
  return {
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
  }
}

/** Read lifecycle trigger from the canvas trigger node (fallback after_meeting). */
export function getTriggerFromNodes(nodes: Node[]): RuleTrigger {
  const t = nodes.find((n) => n.id === RULE_TRIGGER_NODE_ID && n.type === "trigger")
  const d = (t?.data ?? {}) as Record<string, unknown>
  return isRuleTrigger(d.trigger) ? d.trigger : "after_meeting"
}
