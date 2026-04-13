"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Bot, Mail, Webhook, Bell, Puzzle, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RuleStepNodeData } from "./rule-flow-utils"
import type { RuleStepType } from "@/lib/api"

/* ── per-type visual config ─────────────────────────────────────────────── */
export type StepTypeConfig = {
  label: string
  icon: React.ElementType
  accent: string
  iconBg: string
  iconFg: string
  gradientFrom: string
}

export const STEP_TYPE_CONFIG: Record<RuleStepType, StepTypeConfig> = {
  llm_prompt: {
    label: "LLM Prompt",
    icon: Bot,
    accent: "#8b5cf6",
    iconBg: "bg-violet-500/20",
    iconFg: "text-violet-300",
    gradientFrom: "rgba(109,40,217,0.25)",
  },
  send_email: {
    label: "Send Email",
    icon: Mail,
    accent: "#38bdf8",
    iconBg: "bg-sky-500/20",
    iconFg: "text-sky-300",
    gradientFrom: "rgba(2,132,199,0.25)",
  },
  push_notification: {
    label: "Web Push",
    icon: Bell,
    accent: "#fbbf24",
    iconBg: "bg-amber-500/20",
    iconFg: "text-amber-300",
    gradientFrom: "rgba(180,83,9,0.25)",
  },
  webhook: {
    label: "Webhook",
    icon: Webhook,
    accent: "#34d399",
    iconBg: "bg-emerald-500/20",
    iconFg: "text-emerald-300",
    gradientFrom: "rgba(6,95,70,0.25)",
  },
  composio_action: {
    label: "Composio",
    icon: Puzzle,
    accent: "#e879f9",
    iconBg: "bg-fuchsia-500/20",
    iconFg: "text-fuchsia-300",
    gradientFrom: "rgba(134,25,143,0.25)",
  },
}

/* shared handle style — big, always visible ring ─────────────────────────── */
const handleBase =
  "!absolute !z-10 !flex !items-center !justify-center !rounded-full !border-[3px] !border-[#0d0d10] !transition-transform hover:!scale-125 active:!scale-110"

/* ── Trigger Node ─────────────────────────────────────────────────────────── */
export const TriggerNode = memo(function TriggerNode({ data, selected }: NodeProps) {
  const label = typeof data.label === "string" ? data.label : "Trigger"
  const accent = "#fbbf24"

  return (
    <div
      className={cn(
        "relative w-[210px] rounded-2xl border bg-zinc-900 shadow-xl transition-all duration-150",
        selected ? "border-amber-400/70 shadow-amber-500/15" : "border-white/[0.1]"
      )}
      style={selected ? { boxShadow: `0 0 0 3px ${accent}44, 0 20px 40px rgba(0,0,0,.5)` } : undefined}
    >
      {/* accent left bar */}
      <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ background: accent }} />

      {/* header */}
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
        style={{ background: `linear-gradient(135deg, rgba(180,83,9,0.3) 0%, transparent 70%)` }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
          <Zap className="h-4.5 w-4.5 text-amber-300" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Trigger</p>
          <p className="text-[12px] font-semibold leading-snug text-white/95">{label}</p>
        </div>
      </div>

      {/* source handle — right side, always visible */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(handleBase, "!-right-4 !top-1/2 !h-6 !w-6 !-translate-y-1/2 !bg-amber-400 hover:!bg-amber-300")}
        title="Drag to connect"
      />
    </div>
  )
})

/* ── Step Node ────────────────────────────────────────────────────────────── */
export const RuleStepNode = memo(function RuleStepNode({ data, selected }: NodeProps) {
  const d = data as RuleStepNodeData
  const cfg = STEP_TYPE_CONFIG[d.step_type] ?? STEP_TYPE_CONFIG.llm_prompt
  const Icon = cfg.icon

  return (
    <div
      className={cn(
        "relative w-[230px] rounded-2xl border bg-zinc-900 shadow-xl transition-all duration-150",
        selected ? "border-white/30" : "border-white/[0.1]"
      )}
      style={selected ? { borderColor: cfg.accent, boxShadow: `0 0 0 3px ${cfg.accent}44, 0 20px 40px rgba(0,0,0,.5)` } : undefined}
    >
      {/* accent left bar */}
      <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ background: cfg.accent }} />

      {/* header */}
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
        style={{ background: `linear-gradient(135deg, ${cfg.gradientFrom} 0%, transparent 70%)` }}
      >
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", cfg.iconBg)}>
          <Icon className={cn("h-[18px] w-[18px]", cfg.iconFg)} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">{cfg.label}</p>
          <p className="truncate text-[12px] font-semibold leading-snug text-white/95">{d.name}</p>
        </div>
      </div>

      {/* target handle — left, white ring */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(handleBase, "!-left-4 !top-1/2 !h-6 !w-6 !-translate-y-1/2 !bg-zinc-700 hover:!bg-white/80")}
        title="Drop connection here"
      />

      {/* source handle — right, accent colour */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(handleBase, "!-right-4 !top-1/2 !h-6 !w-6 !-translate-y-1/2 hover:!brightness-125")}
        style={{ background: cfg.accent }}
        title="Drag to connect"
      />
    </div>
  )
})
