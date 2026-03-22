"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const accents = {
  violet: "from-violet-500/18 via-violet-400/5 to-transparent",
  cyan: "from-cyan-400/20 via-cyan-300/5 to-transparent",
  fuchsia: "from-fuchsia-500/18 via-fuchsia-400/5 to-transparent",
} as const

export function StatMetricCard({
  label,
  value,
  icon: Icon,
  loading,
  accent = "violet",
  className,
}: {
  label: string
  value: string
  icon: LucideIcon
  loading?: boolean
  accent?: keyof typeof accents
  className?: string
}) {
  return (
    <div
      className={cn(
        "workspace-card relative overflow-hidden bg-gradient-to-br p-5",
        accents[accent],
        className
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/[0.04] blur-2xl" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
          <Icon className="h-5 w-5 text-white/80" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            {label}
          </p>
          {loading ? (
            <div className="mt-2 h-9 w-24 animate-pulse rounded-lg bg-white/[0.08]" />
          ) : (
            <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] text-white">
              {value}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
