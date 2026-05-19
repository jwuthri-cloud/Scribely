"use client"

import { useState } from "react"
import type { MeetingRuleExecutionStep } from "@/lib/api"
import { JsonCodeBlock, RuleStepResult } from "@/components/app/meeting/RuleStepResult"

function RuleExecutionStepItem({
  step,
  idx,
}: {
  step: MeetingRuleExecutionStep
  idx: number
}) {
  const [mode, setMode] = useState<"pretty" | "raw">("pretty")
  const hasResult = step.result !== null && step.result !== undefined

  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-white/85">{step.name ?? `Step ${idx + 1}`}</span>
        {step.step_type ? (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/45">
            {step.step_type}
          </span>
        ) : null}
        {typeof step.ok === "boolean" ? (
          <span
            className={
              step.ok
                ? "text-[10px] uppercase text-emerald-400/80"
                : "text-[10px] uppercase text-red-400/80"
            }
          >
            {step.ok ? "ok" : "failed"}
          </span>
        ) : null}
        {hasResult ? (
          <div className="ml-auto inline-flex overflow-hidden rounded border border-white/10 text-[10px] font-medium">
            <button
              type="button"
              onClick={() => setMode("pretty")}
              className={
                "px-2 py-0.5 uppercase tracking-wide transition " +
                (mode === "pretty"
                  ? "bg-white/10 text-white/90"
                  : "text-white/50 hover:text-white/80")
              }
            >
              Pretty
            </button>
            <button
              type="button"
              onClick={() => setMode("raw")}
              className={
                "px-2 py-0.5 uppercase tracking-wide transition " +
                (mode === "raw"
                  ? "bg-white/10 text-white/90"
                  : "text-white/50 hover:text-white/80")
              }
            >
              Raw
            </button>
          </div>
        ) : null}
      </div>
      {step.error ? <p className="mt-1 text-xs text-red-400/90">{step.error}</p> : null}
      {hasResult ? (
        <div className="mt-2">
          {mode === "pretty" ? (
            <RuleStepResult value={step.result} stepType={step.step_type} />
          ) : (
            <JsonCodeBlock value={step.result} />
          )}
        </div>
      ) : null}
    </li>
  )
}

export function RuleExecutionSteps({ steps }: { steps: MeetingRuleExecutionStep[] }) {
  return (
    <ol className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
      {steps.map((step, idx) => (
        <RuleExecutionStepItem key={step.step_id ?? `step-${idx}`} step={step} idx={idx} />
      ))}
    </ol>
  )
}
