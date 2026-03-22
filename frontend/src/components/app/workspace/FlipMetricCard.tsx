"use client"

import { useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

const accentClasses = {
  violet:
    "from-violet-500/22 via-violet-400/5 to-transparent text-violet-100 ring-violet-400/25",
  cyan: "from-cyan-400/24 via-cyan-300/6 to-transparent text-cyan-50 ring-cyan-300/25",
  amber:
    "from-amber-300/24 via-amber-200/8 to-transparent text-amber-50 ring-amber-200/25",
} as const

export function FlipMetricCard({
  label,
  value,
  icon: Icon,
  detail,
  helper,
  accent = "violet",
  loading = false,
}: {
  label: string
  value: string
  icon: LucideIcon
  detail: string
  helper: string
  accent?: keyof typeof accentClasses
  loading?: boolean
}) {
  const [flipped, setFlipped] = useState(false)
  const accentClass = useMemo(() => accentClasses[accent], [accent])

  return (
    <button
      type="button"
      className="group block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:[perspective:none]"
      data-flipped={flipped}
      onClick={() => setFlipped((prev) => !prev)}
      aria-label={`${label} details`}
      aria-pressed={flipped}
    >
      <div className="workspace-flip-inner motion-reduce:transform-none">
        <div
          className={cn(
            "workspace-flip-face workspace-card overflow-hidden p-5 sm:p-6",
            "bg-gradient-to-br",
            accentClass
          )}
        >
          <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-white/45">
            Tap to flip
          </div>
          <div className="flex h-full flex-col justify-between gap-8">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/55">
                  {label}
                </p>
                {loading ? (
                  <div className="h-10 w-24 animate-pulse rounded-full bg-white/10" />
                ) : (
                  <p className="font-display text-4xl font-semibold tracking-[-0.05em] text-white">
                    {value}
                  </p>
                )}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20 shadow-inner shadow-black/30">
                <Icon className="h-5 w-5 text-white/80" />
              </div>
            </div>

            <div className="flex items-end justify-between gap-4">
              <p className="max-w-[18rem] text-sm leading-6 text-white/58">{helper}</p>
              <ArrowUpRight className="h-5 w-5 shrink-0 text-white/35" />
            </div>
          </div>
        </div>

        <div className="workspace-flip-face workspace-flip-back workspace-card overflow-hidden bg-[linear-gradient(160deg,rgba(11,16,32,0.98),rgba(9,12,24,0.92))] p-5 sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.16),transparent_26%)]" />
          <div className="relative flex h-full flex-col justify-between gap-6">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/75">
                {label}
              </p>
              <p className="text-xl font-semibold text-white">{detail}</p>
              <p className="text-sm leading-6 text-white/58">{helper}</p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-medium text-white/75">
              Click again to close
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
