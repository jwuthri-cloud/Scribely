import { describe, expect, it } from "vitest"
import type { Edge, Node } from "@xyflow/react"
import { RULE_TRIGGER_NODE_ID } from "./constants"
import {
  ancestorStepIdsFromEdges,
  flowToStepDrafts,
  priorStepDraftsOrdered,
  topoOrderFromEdges,
} from "./rule-flow-utils"

function triggerNode(): Node {
  return {
    id: RULE_TRIGGER_NODE_ID,
    type: "trigger",
    position: { x: 0, y: 0 },
    data: { trigger: "after_meeting", label: "Trigger" },
  }
}

function ruleStepNode(id: string, name: string): Node {
  return {
    id,
    type: "ruleStep",
    position: { x: 100, y: 100 },
    data: { name, step_type: "llm_prompt" as const, config: {} },
  }
}

describe("ancestorStepIdsFromEdges", () => {
  it("returns empty for both branches when trigger fans out to two steps", () => {
    const edges: Edge[] = [
      { id: "e1", source: RULE_TRIGGER_NODE_ID, target: "a" },
      { id: "e2", source: RULE_TRIGGER_NODE_ID, target: "b" },
    ]
    const stepIds = new Set(["a", "b"])
    expect(ancestorStepIdsFromEdges("a", edges, stepIds).size).toBe(0)
    expect(ancestorStepIdsFromEdges("b", edges, stepIds).size).toBe(0)
  })

  it("collects all upstream steps on a chain", () => {
    const edges: Edge[] = [
      { id: "e0", source: RULE_TRIGGER_NODE_ID, target: "a" },
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
    ]
    const stepIds = new Set(["a", "b", "c"])
    expect(Array.from(ancestorStepIdsFromEdges("c", edges, stepIds)).sort()).toEqual(["a", "b"])
    expect(Array.from(ancestorStepIdsFromEdges("a", edges, stepIds))).toEqual([])
  })

  it("includes both parallel paths into a merge node", () => {
    const edges: Edge[] = [
      { id: "e0", source: RULE_TRIGGER_NODE_ID, target: "E" },
      { id: "e1", source: RULE_TRIGGER_NODE_ID, target: "S" },
      { id: "e2", source: "E", target: "M" },
      { id: "e3", source: "S", target: "M" },
    ]
    const stepIds = new Set(["E", "S", "M"])
    expect(Array.from(ancestorStepIdsFromEdges("M", edges, stepIds)).sort()).toEqual(["E", "S"])
  })
})

describe("priorStepDraftsOrdered", () => {
  it("matches flowToStepDrafts order for ancestor chips (parallel)", () => {
    const nodes = [triggerNode(), ruleStepNode("a", "A"), ruleStepNode("b", "B")]
    const edges: Edge[] = [
      { id: "e1", source: RULE_TRIGGER_NODE_ID, target: "a" },
      { id: "e2", source: RULE_TRIGGER_NODE_ID, target: "b" },
    ]
    const { drafts, error } = flowToStepDrafts(nodes, edges)
    expect(error).toBeNull()
    const stepIds = new Set(nodes.filter((n) => n.type === "ruleStep").map((n) => n.id))

    const priorsA = priorStepDraftsOrdered("a", drafts, edges, stepIds)
    const priorsB = priorStepDraftsOrdered("b", drafts, edges, stepIds)
    expect(priorsA).toEqual([])
    expect(priorsB).toEqual([])
  })

  it("lists only ancestors with steps indices 0..n-1 for merge", () => {
    const nodes = [
      triggerNode(),
      ruleStepNode("E", "Send"),
      ruleStepNode("S", "Summarize"),
      ruleStepNode("M", "Merge"),
    ]
    const edges: Edge[] = [
      { id: "e0", source: RULE_TRIGGER_NODE_ID, target: "E" },
      { id: "e1", source: RULE_TRIGGER_NODE_ID, target: "S" },
      { id: "e2", source: "E", target: "M" },
      { id: "e3", source: "S", target: "M" },
    ]
    const { drafts, error } = flowToStepDrafts(nodes, edges)
    expect(error).toBeNull()
    const stepIds = new Set(["E", "S", "M"])

    const priorsM = priorStepDraftsOrdered("M", drafts, edges, stepIds)
    expect(priorsM.map((d) => d.id)).toEqual(["E", "S"])
    expect(priorsM[0]?.order_index).toBeLessThan(priorsM[1]!.order_index)
  })
})

describe("topoOrderFromEdges + flowToStepDrafts", () => {
  it("errors on cycle", () => {
    const nodes = [triggerNode(), ruleStepNode("a", "A"), ruleStepNode("b", "B")]
    const edges: Edge[] = [
      { id: "e0", source: RULE_TRIGGER_NODE_ID, target: "a" },
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "a" },
    ]
    const stepIds = new Set(["a", "b"])
    const { error } = topoOrderFromEdges(edges, stepIds)
    expect(error).toMatch(/cycle/i)
    const r = flowToStepDrafts(nodes, edges)
    expect(r.error).toMatch(/cycle/i)
  })

  it("orders lexicographically when both connect from trigger", () => {
    const nodes = [triggerNode(), ruleStepNode("m_step", "M"), ruleStepNode("z_step", "Z")]
    const edges: Edge[] = [
      { id: "e1", source: RULE_TRIGGER_NODE_ID, target: "m_step" },
      { id: "e2", source: RULE_TRIGGER_NODE_ID, target: "z_step" },
    ]
    const { drafts, error } = flowToStepDrafts(nodes, edges)
    expect(error).toBeNull()
    expect(drafts.map((d) => d.id)).toEqual(["m_step", "z_step"])
  })

  it("appends orphan steps after topo reachables, sorted by id", () => {
    const nodes = [triggerNode(), ruleStepNode("wired", "W"), ruleStepNode("orphan", "O")]
    const edges: Edge[] = [{ id: "e1", source: RULE_TRIGGER_NODE_ID, target: "wired" }]
    const { drafts, error, orphanIds } = flowToStepDrafts(nodes, edges)
    expect(error).toBeNull()
    expect(orphanIds).toEqual(["orphan"])
    expect(drafts.map((d) => d.id)).toEqual(["wired", "orphan"])
  })
})
