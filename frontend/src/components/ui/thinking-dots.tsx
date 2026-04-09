"use client"

import React from "react"
import { cn } from "@/lib/utils"

type ThinkingDotsProps = {
  /** Shown before the animated dots (default: Thinking) */
  label?: string
  className?: string
}

/**
 * Inline “Thinking …” with three dots that wave in sequence (no spinner).
 */
export function ThinkingDots({ label = "Thinking", className }: ThinkingDotsProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm text-current", className)}
      role="status"
      aria-live="polite"
    >
      <span>{label}</span>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        <span className="inline-block h-1 w-1 rounded-full bg-current animate-thinking-dot" />
        <span className="inline-block h-1 w-1 rounded-full bg-current animate-thinking-dot [animation-delay:160ms]" />
        <span className="inline-block h-1 w-1 rounded-full bg-current animate-thinking-dot [animation-delay:320ms]" />
      </span>
    </span>
  )
}
