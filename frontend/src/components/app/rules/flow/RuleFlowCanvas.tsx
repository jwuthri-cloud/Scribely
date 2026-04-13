"use client"

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useState,
} from "react"
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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Bot,
  Mail,
  Webhook,
  Bell,
  Puzzle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react"
import type { RuleTrigger, RuleStepType } from "@/lib/api"
import { StepConfigForm, newStepDraft, type StepDraft } from "@/components/app/rules/StepConfigForm"
import { cn } from "@/lib/utils"
import { RULE_TRIGGER_NODE_ID } from "./constants"
import { RuleStepNode, TriggerNode, STEP_TYPE_CONFIG } from "./RuleNodes"
import {
  flowLayoutSnapshot,
  flowToStepDrafts,
  type RuleStepNodeData,
} from "./rule-flow-utils"

/* ── constants ───────────────────────────────────────────────────────────── */
const TRIGGER_LABEL: Record<RuleTrigger, string> = {
  before_meeting: "Before meeting",
  after_meeting: "After meeting",
  during_meeting: "During meeting",
}

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
  style: { stroke: "rgba(255,255,255,0.25)", strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "rgba(255,255,255,0.35)",
  } satisfies EdgeMarker,
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
  applyPromptToFirstLlm: (text: string) => void
  getFirstLlmPrompt: () => string
}

type Props = {
  trigger: RuleTrigger
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

/* ── InspectorPanel ──────────────────────────────────────────────────────── */
function InspectorPanel({
  step,
  onChange,
  onRemove,
  orderIndex,
}: {
  step: StepDraft
  onChange: (s: StepDraft) => void
  onRemove: () => void
  orderIndex: number
}) {
  const cfg = STEP_TYPE_CONFIG[step.step_type] ?? STEP_TYPE_CONFIG.llm_prompt
  const Icon = cfg.icon

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-900">
      {/* header */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{
          background: `linear-gradient(135deg, ${cfg.gradientFrom} 0%, transparent 70%)`,
          borderBottom: `1px solid ${cfg.accent}33`,
        }}
      >
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", cfg.iconBg)}>
          <Icon className={cn("h-5 w-5", cfg.iconFg)} />
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
      {/* form */}
      <div className="flex-1 overflow-y-auto p-4">
        <StepConfigForm step={step} onChange={onChange} />
      </div>
    </div>
  )
}

/* ── inner canvas (must be inside ReactFlowProvider) ─────────────────────── */
const RuleFlowInner = forwardRef<RuleFlowCanvasHandle, Props>(function RuleFlowInner(
  { trigger, initialNodes, initialEdges, className },
  ref
) {
  const { screenToFlowPosition } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges.map((e) => ({ ...EDGE_DEFAULTS, ...e, style: EDGE_DEFAULTS.style }))
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  /* keep trigger label in sync */
  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === RULE_TRIGGER_NODE_ID
          ? { ...n, data: { ...n.data, label: TRIGGER_LABEL[trigger] ?? trigger.replace(/_/g, " ") } }
          : n
      )
    )
  }, [trigger, setNodes])

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.target === RULE_TRIGGER_NODE_ID) return
      setEdges((eds) =>
        addEdge({ ...EDGE_DEFAULTS, ...params, id: `e-${params.source}-${params.target}` }, eds)
      )
    },
    [setEdges]
  )

  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[] }) => {
    const n = sel[0]
    const next = n?.type === "ruleStep" ? n.id : null
    setSelectedId(next)
    if (next) setInspectorOpen(true)
  }, [])

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId && n.type === "ruleStep") ?? null,
    [nodes, selectedId]
  )

  const orderedDraftsMeta = useMemo(() => flowToStepDrafts(nodes, edges), [nodes, edges])

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
            config: draft.config,
          } satisfies RuleStepNodeData,
        },
      ])
      setSelectedId(id)
      setInspectorOpen(true)
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
    applyPromptToFirstLlm: (text: string) => {
      setNodes((ns) => {
        let done = false
        return ns.map((n) => {
          if (n.type !== "ruleStep" || done) return n
          const d = n.data as RuleStepNodeData
          if (d.step_type !== "llm_prompt") return n
          done = true
          return { ...n, data: { ...d, config: { ...d.config, user_prompt_template: text } } }
        })
      })
    },
    getFirstLlmPrompt: () => {
      for (const n of nodes) {
        if (n.type !== "ruleStep") continue
        const d = n.data as RuleStepNodeData
        if (d.step_type !== "llm_prompt") continue
        const t = d.config?.user_prompt_template
        return typeof t === "string" ? t : ""
      }
      return ""
    },
  }), [nodes, edges, setNodes])

  const stepCount = nodes.filter((n) => n.type === "ruleStep").length

  return (
    <div className={cn("flex min-h-[620px] flex-col rounded-2xl border border-white/[0.08] bg-[#0d0d10]", className)}>
      {/* ── toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-zinc-950 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/50">
            {stepCount} step{stepCount !== 1 ? "s" : ""}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-[10px] text-white/35">
            Use <code className="text-emerald-300/80">{"{{ steps[0].result }}"}</code> to pipe outputs
          </span>
          {orderedDraftsMeta.error && (
            <span className="text-[10px] text-amber-400/95" title={orderedDraftsMeta.error}>
              · Fix cycle to save
            </span>
          )}
        </div>
        <div className="relative flex items-center gap-2">
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
              <NodePicker
                onPick={addStep}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── canvas + inspector row ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* canvas */}
        <div className="min-h-[560px] min-w-0 flex-1 bg-[#0d0d10]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            className="bg-[#0d0d10]"
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
            <Controls
              className="!border-white/[0.08] !bg-zinc-900/95 [&>button]:!border-white/[0.08] [&>button]:!bg-transparent [&>button]:!text-white/60 [&>button:hover]:!bg-white/[0.07]"
            />
          </ReactFlow>
        </div>

        {/* inspector */}
        {selectedStepDraft && (
          <div className="flex w-[360px] shrink-0 flex-col border-l border-white/[0.08] bg-zinc-950">
            {/* inspector toggle header */}
            <button
              type="button"
              onClick={() => setInspectorOpen((o) => !o)}
              className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2.5 text-left hover:bg-white/[0.03]"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Node config</span>
              {inspectorOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-white/40" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-white/40" />
              )}
            </button>
            {inspectorOpen && (
              <div className="flex-1 overflow-y-auto p-3">
                <InspectorPanel
                  step={selectedStepDraft}
                  onChange={updateSelectedStep}
                  onRemove={removeSelectedStep}
                  orderIndex={selectedStepDraft.order_index}
                />
              </div>
            )}
          </div>
        )}
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
