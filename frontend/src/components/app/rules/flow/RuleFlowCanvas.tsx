"use client"

import { useCallback, useImperativeHandle, forwardRef, useMemo, useState } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type EdgeMarker,
  type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Plus, Trash2, X } from "lucide-react"
import type { RuleStepType, RuleTrigger } from "@/lib/api"
import {
  StepConfigForm,
  defaultConfig,
  newStepDraft,
  VariableChip,
  type StepDraft,
  type OutputSchemaField,
} from "@/components/app/rules/StepConfigForm"
import { cn } from "@/lib/utils"
import { RULE_TRIGGER_NODE_ID } from "./constants"
import { RuleStepNode, TriggerNode, STEP_TYPE_CONFIG } from "./RuleNodes"
import {
  flowLayoutSnapshot,
  flowToStepDrafts,
  getTriggerFromNodes,
  priorStepDraftsOrdered,
  type RuleStepNodeData,
} from "./rule-flow-utils"

/* ── constants ───────────────────────────────────────────────────────────── */
const STEP_TYPES: RuleStepType[] = [
  "llm_prompt",
  "send_email",
  "push_notification",
  "webhook",
  "composio_action",
]

const nodeTypes = { trigger: TriggerNode, ruleStep: RuleStepNode }

const EDGE_DEFAULTS = {
  type: "smoothstep" as const,
  animated: true,
  /** Wider hit target so edges are easier to select */
  interactionWidth: 28,
  selectable: true,
  deletable: true,
  style: { stroke: "rgba(255,255,255,0.25)", strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "rgba(255,255,255,0.35)",
  } satisfies EdgeMarker,
}

/** Inline stroke wins over RF’s `.selected` CSS — we tint edges when `selected` is set on the edge model. */
const EDGE_SELECTED_STROKE = "rgba(196, 181, 253, 0.98)"
const EDGE_SELECTED_MARKER = "rgba(196, 181, 253, 0.98)"

function edgesWithSelectionHighlight<E extends Edge>(edges: E[], selectedIds: ReadonlySet<string>): E[] {
  return edges.map((e) => {
    const selected = Boolean(e.selected) || selectedIds.has(e.id)
    const baseStyle = {
      ...EDGE_DEFAULTS.style,
      ...(e.style && typeof e.style === "object" ? e.style : {}),
    }
    const markerBase = {
      ...EDGE_DEFAULTS.markerEnd,
      ...(e.markerEnd && typeof e.markerEnd === "object" ? e.markerEnd : {}),
    } satisfies EdgeMarker

    return {
      ...e,
      style: selected
        ? { ...baseStyle, stroke: EDGE_SELECTED_STROKE, strokeWidth: 3 }
        : baseStyle,
      markerEnd: selected
        ? { ...markerBase, type: MarkerType.ArrowClosed, color: EDGE_SELECTED_MARKER }
        : markerBase,
      zIndex: selected ? 1001 : e.zIndex,
    }
  })
}

/* ── types ───────────────────────────────────────────────────────────────── */
export type RuleFlowSavePayload = {
  steps: Array<{
    id?: string
    order_index: number
    name: string
    step_type: StepDraft["step_type"]
    config: Record<string, unknown>
  }>
  flow_layout: Record<string, unknown>
  error: string | null
}

export type RuleFlowCanvasHandle = {
  getSavePayload: () => RuleFlowSavePayload
  getTrigger: () => RuleTrigger
}

type Props = {
  initialNodes: Node[]
  initialEdges: Edge[]
  className?: string
}

/* ── NodePicker popup ────────────────────────────────────────────────────── */
function NodePicker({
  onPick,
  onClose,
}: {
  onPick: (type: RuleStepType) => void
  onClose: () => void
}) {
  return (
    <div className="w-64 overflow-hidden rounded-2xl border border-white/[0.12] bg-zinc-900/95 shadow-2xl shadow-black/60 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Add step</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-white/40 hover:bg-white/[0.08] hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-2">
        {STEP_TYPES.map((type) => {
          const cfg = STEP_TYPE_CONFIG[type]
          const Icon = cfg.icon
          return (
            <button
              key={type}
              type="button"
              onClick={() => onPick(type)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
            >
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", cfg.iconBg)}>
                <Icon className={cn("h-4 w-4", cfg.iconFg)} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-white/90">{cfg.label}</p>
                <p className="text-[10px] text-white/40">{type}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── empty state (no step selected) ──────────────────────────────────────── */
function EmptyConfigPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-zinc-950/35 px-6 text-center">
      <p className="text-sm font-medium text-white/55">Node config</p>
      <p className="mt-2 text-sm text-white/40">
        Select a step on the canvas to edit its parameters.
      </p>
      <p className="mt-3 text-xs text-white/30">
        Use <span className="text-white/50">Add step</span> to create a new node, then wire it from the trigger.
      </p>
    </div>
  )
}

/* ── Input side-panel ───────────────────────────────────────────────────── */
function InputSidePanel({
  stepType,
  priorDrafts,
}: {
  stepType: string
  priorDrafts: StepDraft[]
}) {
  const meetingVars = [
    { label: "meeting.id", token: "{{ meeting.id }}" },
    { label: "meeting.title", token: "{{ meeting.title }}" },
    { label: "meeting.transcript", token: "{{ meeting.transcript }}" },
    { label: "meeting.summary", token: "{{ meeting.summary }}" },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-700/70 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Input</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 [color-scheme:dark]">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Meeting context</p>
          <div className="flex flex-col gap-1.5">
            {meetingVars.map(({ label, token }) => (
              <VariableChip key={label} label={label} varToken={token} className="w-full justify-start" />
            ))}
            <span className="rounded-md border border-zinc-700/50 bg-zinc-800/60 px-2 py-1 font-mono text-[11px] text-zinc-500">
              participants (array)
            </span>
          </div>
        </div>

        {priorDrafts.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Prior steps</p>
            <div className="flex flex-col gap-3">
              {priorDrafts.map((draft, i) => {
                const schema = Array.isArray(draft.config.output_schema)
                  ? (draft.config.output_schema as OutputSchemaField[])
                  : null
                const hasSchema = schema && schema.length > 0
                return (
                  <div key={draft.id ?? `prior-${i}`}>
                    {/* step label */}
                    <p className="mb-1 text-[10px] text-zinc-600 truncate">
                      {i + 1}. {draft.name}
                    </p>
                    <div className="flex flex-col gap-1">
                      {hasSchema ? (
                        /* individual schema field chips */
                        schema.map((f) => (
                          <VariableChip
                            key={f.name}
                            label={`steps[${i}].result.${f.name}`}
                            varToken={`{{ steps[${i}].result.${f.name} }}`}
                            className="w-full justify-start"
                          />
                        ))
                      ) : (
                        /* plain result chip */
                        <VariableChip
                          label={`steps[${i}].result`}
                          varToken={`{{ steps[${i}].result }}`}
                          className="w-full justify-start"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {priorDrafts.length === 0 && (
          <p className="text-xs text-zinc-600">
            No upstream steps on this branch. Only meeting context above applies unless you wire a step before this
            one.
          </p>
        )}
        <p className="pt-1 text-[10px] text-zinc-600">
          Drag a chip into any template field →
        </p>
        {stepType === "webhook" && (
          <p className="text-[10px] text-zinc-500 border-t border-zinc-700/50 pt-3">Body + headers are Jinja-rendered with the same context.</p>
        )}
      </div>
    </div>
  )
}

/* ── Output side-panel ──────────────────────────────────────────────────── */
function OutputSidePanel({
  stepType,
  runPosition1Based,
  totalFlowSteps,
  outputSchema,
}: {
  stepType: string
  runPosition1Based: number
  totalFlowSteps: number
  outputSchema?: OutputSchemaField[]
}) {
  const hasSchema = Array.isArray(outputSchema) && outputSchema.length > 0

  const defaultRows = (() => {
    switch (stepType) {
      case "llm_prompt":
        return [{ key: "result", desc: "model response text" }]
      case "send_email":
        return [
          { key: "status", desc: "HTTP status from Resend" },
          { key: "body", desc: "JSON response object" },
        ]
      case "push_notification":
        return [
          { key: "sent", desc: "subscriptions notified" },
          { key: "total", desc: "total subscriptions" },
        ]
      case "webhook":
        return [
          { key: "status", desc: "HTTP status code" },
          { key: "text", desc: "response body preview" },
        ]
      case "composio_action":
        return [{ key: "result", desc: "Composio tool response" }]
      default:
        return []
    }
  })()

  const rows = hasSchema
    ? (outputSchema ?? []).map((f) => ({
        key: f.name,
        desc: f.description ?? f.type,
      }))
    : defaultRows

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-700/70 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Output</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 [color-scheme:dark]">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {hasSchema ? "Structured fields" : "Step result"}
        </p>
        <p className="mb-2 text-[10px] text-zinc-500">
          Run order: {runPosition1Based} of {totalFlowSteps}. To paste into a downstream step, open that step and use
          chips under <span className="text-zinc-400">Prior steps</span> — indices are relative to upstream steps only.
        </p>
        <div className="flex flex-col gap-2">
          {rows.map(({ key, desc }) => (
            <div key={key} className="space-y-0.5 rounded-md border border-zinc-700/40 bg-zinc-900/40 px-2 py-1.5">
              <p className="font-mono text-[11px] text-emerald-300/90">{key}</p>
              <p className="text-[10px] text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── InspectorPanel ──────────────────────────────────────────────────────── */
function InspectorPanel({
  step,
  onChange,
  onRemove,
  orderIndex,
  priorDrafts,
  totalFlowSteps,
}: {
  step: StepDraft
  onChange: (s: StepDraft) => void
  onRemove: () => void
  orderIndex: number
  priorDrafts: StepDraft[]
  totalFlowSteps: number
}) {
  const cfg = STEP_TYPE_CONFIG[step.step_type] ?? STEP_TYPE_CONFIG.llm_prompt
  const Icon = cfg.icon

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-900 [color-scheme:dark]">
      {/* header row */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${cfg.gradientFrom} 0%, transparent 70%)`,
          borderBottom: `1px solid ${cfg.accent}33`,
        }}
      >
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", cfg.iconBg)}>
          <Icon className={cn("h-4 w-4", cfg.iconFg)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">
            Step {orderIndex + 1} — {cfg.label}
          </p>
          <p className="truncate text-sm font-semibold text-white/90">{step.name}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-1.5 text-red-400/70 hover:bg-red-500/15 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* three-column body: INPUT | PARAMETERS | OUTPUT — fills parent, clips overflow */}
      <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)_200px] divide-x divide-zinc-700/60 overflow-hidden">
        {/* left — input */}
        <div className="min-w-0 overflow-y-auto overflow-x-hidden bg-zinc-950/60">
          <InputSidePanel stepType={step.step_type} priorDrafts={priorDrafts} />
        </div>

        {/* centre — parameters */}
        <div className="min-w-0 overflow-y-auto overflow-x-hidden bg-zinc-900 p-5">
          <StepConfigForm step={step} onChange={onChange} />
        </div>

        {/* right — output */}
        <div className="min-w-0 overflow-y-auto overflow-x-hidden bg-zinc-950/60">
          <OutputSidePanel
            stepType={step.step_type}
            runPosition1Based={orderIndex + 1}
            totalFlowSteps={totalFlowSteps}
            outputSchema={
              Array.isArray(step.config.output_schema)
                ? (step.config.output_schema as OutputSchemaField[])
                : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}

/* ── inner canvas (must be inside ReactFlowProvider) ─────────────────────── */
const RuleFlowInner = forwardRef<RuleFlowCanvasHandle, Props>(function RuleFlowInner(
  { initialNodes, initialEdges, className },
  ref
) {
  const { screenToFlowPosition } = useReactFlow()
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges.map((e) => ({
      ...EDGE_DEFAULTS,
      ...e,
      selectable: true,
      deletable: true,
      interactionWidth: EDGE_DEFAULTS.interactionWidth,
      style: { ...EDGE_DEFAULTS.style, ...e.style },
    }))
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(() => new Set())

  const edgesForFlow = useMemo(
    () => edgesWithSelectionHighlight(edges, selectedEdgeIds),
    [edges, selectedEdgeIds]
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const filtered = changes.filter(
        (c) => !(c.type === "remove" && "id" in c && c.id === RULE_TRIGGER_NODE_ID)
      )
      onNodesChangeBase(filtered)
    },
    [onNodesChangeBase]
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.target === RULE_TRIGGER_NODE_ID) return
      setEdges((eds) =>
        addEdge({ ...EDGE_DEFAULTS, ...params, id: `e-${params.source}-${params.target}` }, eds)
      )
    },
    [setEdges]
  )

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedEdgeIds(new Set(selEdges.map((e) => e.id)))
      if (selEdges.length > 0 && selNodes.length === 0) {
        setSelectedId(null)
        return
      }
      const n = selNodes[0]
      const next = n?.type === "ruleStep" ? n.id : null
      setSelectedId(next)
    },
    []
  )

  const onEdgeClick = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }, [])

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId && n.type === "ruleStep") ?? null,
    [nodes, selectedId]
  )

  const orderedDraftsMeta = useMemo(() => flowToStepDrafts(nodes, edges), [nodes, edges])

  const stepNodeIds = useMemo(
    () => new Set(nodes.filter((n) => n.type === "ruleStep").map((n) => n.id)),
    [nodes]
  )

  const priorDraftsForSelected = useMemo(() => {
    if (!selectedId) return []
    return priorStepDraftsOrdered(selectedId, orderedDraftsMeta.drafts, edges, stepNodeIds)
  }, [selectedId, orderedDraftsMeta.drafts, edges, stepNodeIds])

  const selectedStepDraft = useMemo((): StepDraft | null => {
    if (!selectedNode) return null
    const d = selectedNode.data as RuleStepNodeData
    const row = orderedDraftsMeta.drafts.find((s) => s.id === selectedNode.id)
    const idx = row?.order_index ?? 0
    return {
      id: selectedNode.id,
      order_index: idx,
      name: d.name,
      step_type: d.step_type,
      config: d.config,
    }
  }, [selectedNode, orderedDraftsMeta.drafts])

  const updateSelectedStep = useCallback(
    (step: StepDraft) => {
      if (!selectedId) return
      setNodes((ns) =>
        ns.map((n) =>
          n.id === selectedId && n.type === "ruleStep"
            ? { ...n, data: { name: step.name, step_type: step.step_type, config: step.config } satisfies RuleStepNodeData }
            : n
        )
      )
    },
    [selectedId, setNodes]
  )

  const addStep = useCallback(
    (stepType: RuleStepType) => {
      const draft = newStepDraft(0)
      const cfg = STEP_TYPE_CONFIG[stepType]
      const id = draft.id ?? `s-${Date.now()}`
      const config = defaultConfig(stepType)

      const canvasEl = document.querySelector(".react-flow__renderer")
      const rect = canvasEl?.getBoundingClientRect()
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
      const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
      let position = screenToFlowPosition({ x: cx, y: cy })
      const nSteps = nodes.filter((n) => n.type === "ruleStep").length
      position = {
        x: position.x + (nSteps % 6) * 28,
        y: position.y + (nSteps % 4) * 22,
      }

      setNodes((ns) => [
        ...ns,
        {
          id,
          type: "ruleStep",
          position,
          data: {
            name: cfg.label,
            step_type: stepType,
            config,
          } satisfies RuleStepNodeData,
        },
      ])
      setSelectedId(id)
      setPickerOpen(false)
    },
    [nodes, setNodes, screenToFlowPosition]
  )

  const removeSelectedStep = useCallback(() => {
    if (!selectedId) return
    setNodes((ns) => ns.filter((n) => n.id !== selectedId))
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }, [selectedId, setNodes, setEdges])

  /* exposed handle */
  useImperativeHandle(ref, () => ({
    getSavePayload: (): RuleFlowSavePayload => {
      const { drafts, error } = flowToStepDrafts(nodes, edges)
      if (error) return { steps: [], flow_layout: {}, error }
      return {
        steps: drafts.map((s) => ({
          id: s.id,
          order_index: s.order_index,
          name: s.name,
          step_type: s.step_type,
          config: s.config,
        })),
        flow_layout: flowLayoutSnapshot(nodes, edges),
        error: null,
      }
    },
    getTrigger: (): RuleTrigger => getTriggerFromNodes(nodes),
  }), [nodes, edges])

  const stepCount = nodes.filter((n) => n.type === "ruleStep").length

  const fitViewOptions = useMemo(() => ({ padding: 0.3 as const }), [])

  return (
    <div className={cn("flex min-w-0 flex-col gap-0 overflow-x-hidden", className)}>
      {/* ── Flow canvas — fixed 440px, never shrinks or grows ── */}
      <div
        style={{ height: 440, minHeight: 440, maxHeight: 440 }}
        className="flex flex-col overflow-hidden rounded-t-2xl border border-white/[0.08] bg-[#0d0d10]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-zinc-950 px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-white/50">
              {stepCount} step{stepCount !== 1 ? "s" : ""}
            </span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] text-white/35">
              Wire upstream steps, then use <span className="text-white/45">Prior steps</span> chips for{" "}
              <code className="text-emerald-300/80">{"{{ steps[i].result }}"}</code>
              <span className="text-white/25"> · </span>
              <span className="text-white/30">Select an edge, then Delete or Backspace to remove it</span>
            </span>
            {orderedDraftsMeta.error && (
              <span className="text-[10px] text-amber-400/95" title={orderedDraftsMeta.error}>
                · Fix cycle to save
              </span>
            )}
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:bg-violet-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-full z-50 mt-2">
                <NodePicker onPick={addStep} onClose={() => setPickerOpen(false)} />
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-[#0d0d10]">
          <ReactFlow
            nodes={nodes}
            edges={edgesForFlow}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onEdgeClick={onEdgeClick}
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{
              ...EDGE_DEFAULTS,
            }}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={fitViewOptions}
            autoPanOnNodeFocus={false}
            minZoom={0.3}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            className="h-full bg-[#0d0d10]"
            onPaneClick={() => {
              setSelectedId(null)
              setPickerOpen(false)
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.2}
              color="rgba(255,255,255,0.07)"
            />
            <Controls className="!border-white/[0.08] !bg-zinc-900/95 [&>button]:!border-white/[0.08] [&>button]:!bg-transparent [&>button]:!text-white/60 [&>button:hover]:!bg-white/[0.07]" />
          </ReactFlow>
        </div>
      </div>

      {/* ── Node config — fixed 600px; inner flex clip keeps tall forms from growing the page ── */}
      <div
        style={{ height: 600, minHeight: 600, maxHeight: 600 }}
        className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-b-2xl border-x border-b border-white/[0.08]"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {selectedStepDraft ? (
            <InspectorPanel
              step={selectedStepDraft}
              onChange={updateSelectedStep}
              onRemove={removeSelectedStep}
              orderIndex={selectedStepDraft.order_index}
              priorDrafts={priorDraftsForSelected}
              totalFlowSteps={orderedDraftsMeta.drafts.length}
            />
          ) : (
            <EmptyConfigPlaceholder />
          )}
        </div>
      </div>
    </div>
  )
})

/* ── public export — wraps inner in a provider ───────────────────────────── */
export const RuleFlowCanvas = forwardRef<RuleFlowCanvasHandle, Props>(
  function RuleFlowCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <RuleFlowInner {...props} ref={ref} />
      </ReactFlowProvider>
    )
  }
)
