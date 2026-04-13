"use client"

import { cn } from "@/lib/utils"

type Props = {
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
  /** `card`: full-width row for form grids. `inline`: compact switch for list rows */
  variant?: "card" | "inline"
  /** Used with `card` (default: "Enabled") */
  label?: string
  id?: string
}

/**
 * Custom on/off control matching workspace styling (replaces native checkbox).
 */
export function RuleEnabledToggle({
  enabled,
  onChange,
  disabled,
  variant = "card",
  label = "Enabled",
  id,
}: Props) {
  const track = (
    <span
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
        enabled ? "bg-emerald-500/85" : "bg-white/15"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </span>
  )

  if (variant === "inline") {
    return (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        title={enabled ? "Rule is on — click to disable" : "Rule is off — click to enable"}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) onChange(!enabled)
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/[0.04]"
        )}
      >
        {track}
        <span className="hidden text-[11px] font-medium text-white/50 sm:inline">
          {enabled ? "On" : "Off"}
        </span>
      </button>
    )
  }

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950/80",
        enabled
          ? "border-emerald-500/35 bg-emerald-500/10"
          : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className="text-sm text-white/80">{label}</span>
      {track}
    </button>
  )
}
