"use client"

import { GripVertical, Trash2, ChevronUp, ChevronDown } from "lucide-react"
import { StepConfigForm, newStepDraft, type StepDraft } from "./StepConfigForm"

export type { StepDraft }

export function RuleStepBuilder({
  steps,
  onChange,
}: {
  steps: StepDraft[]
  onChange: (steps: StepDraft[]) => void
}) {
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return
    const next = [...steps]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    onChange(next.map((s, i) => ({ ...s, order_index: i })))
  }

  const remove = (i: number) => {
    const next = steps.filter((_, j) => j !== i)
    onChange(next.map((s, j) => ({ ...s, order_index: j })))
  }

  const update = (i: number, s: StepDraft) => {
    const next = [...steps]
    next[i] = s
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <div
          key={`${i}-${step.order_index}`}
          className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-white/50">
              <GripVertical className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Step {i + 1}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => reorder(i, i - 1)}
                disabled={i === 0}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                aria-label="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => reorder(i, i + 1)}
                disabled={i === steps.length - 1}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                aria-label="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-lg p-1.5 text-red-400/70 hover:bg-red-500/10"
                aria-label="Remove step"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <StepConfigForm step={step} onChange={(s) => update(i, s)} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...steps, newStepDraft(steps.length)])}
        className="w-full rounded-xl border border-dashed border-white/[0.12] py-3 text-sm text-white/50 transition-colors hover:border-white/25 hover:text-white/80"
      >
        + Add step
      </button>
    </div>
  )
}
