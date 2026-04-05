"use client"

import React, { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

export function CoreSpinLoader({
  className,
  size = "default",
  showText = true,
}: {
  className?: string
  /** default: section / page loading; sm: chat rows, badges, inline banners */
  size?: "default" | "sm"
  showText?: boolean
}) {
  const [loadingText, setLoadingText] = useState("Initializing")

  useEffect(() => {
    if (!showText) return
    const states = [
      "Loading...",
      "Fetching Data..",
      "Syncing...",
      "Processing..",
      "Optimizing...",
    ]
    let i = 0
    const interval = setInterval(() => {
      i = (i + 1) % states.length
      setLoadingText(states[i])
    }, 1000)

    return () => clearInterval(interval)
  }, [showText])

  const spinner = (
    <div
      className={cn(
        "relative flex items-center justify-center",
        size === "default" && "h-20 w-20",
        size === "sm" && "h-10 w-10"
      )}
    >
      <div
        className={cn(
          "relative h-20 w-20",
          size === "sm" && "origin-center scale-[0.5]"
        )}
      >
      {/* Base Glow */}
      <div
        className="
          absolute inset-0 rounded-full blur-xl animate-pulse
          bg-emerald-400/15
          dark:bg-cyan-500/10
        "
      />

      {/* Outer Dashed Ring */}
      <div
        className="
          absolute inset-0 rounded-full border border-dashed
          border-emerald-500/40
          dark:border-cyan-500/20
          animate-[spin_10s_linear_infinite]
        "
      />

      {/* Main Arc */}
      <div
        className="
          absolute inset-1 rounded-full border-2 border-transparent
          border-t-emerald-500
          dark:border-t-cyan-400
          shadow-[0_0_6px_rgba(16,185,129,0.5)]
          dark:shadow-[0_0_10px_rgba(34,211,238,0.4)]
          animate-[spin_2s_linear_infinite]
        "
      />

      {/* Reverse Arc */}
      <div
        className="
          absolute inset-3 rounded-full border-2 border-transparent
          border-b-green-600
          dark:border-b-purple-500
          shadow-[0_0_6px_rgba(22,163,74,0.4)]
          dark:shadow-[0_0_10px_rgba(168,85,247,0.4)]
          animate-[spin_3s_linear_infinite_reverse]
        "
      />

      {/* Inner Fast Ring */}
      <div
        className="
          absolute inset-5 rounded-full border border-transparent
          border-l-green-700/60
          dark:border-l-white/50
          animate-[spin_1s_ease-in-out_infinite]
        "
      />

      {/* Orbital Dot */}
      <div className="absolute inset-0 animate-[spin_4s_linear_infinite]">
        <div
          className="
            absolute left-1/2 top-0 -translate-x-1/2
            h-1 w-1 rounded-full
            bg-emerald-600
            dark:bg-cyan-400
            shadow-[0_0_4px_rgba(16,185,129,0.9)]
            dark:shadow-[0_0_6px_rgba(34,211,238,0.8)]
          "
        />
      </div>

      {/* Center Core */}
      <div
        className="
          absolute h-2 w-2 rounded-full animate-pulse
          bg-emerald-700
          dark:bg-white
          shadow-[0_0_6px_rgba(16,185,129,0.6)]
          dark:shadow-[0_0_10px_rgba(255,255,255,0.8)]
        "
      />
      </div>
    </div>
  )

  return (
    <div
      role="status"
      aria-live={showText ? "polite" : undefined}
      aria-label={showText ? undefined : "Loading"}
      className={cn(
        "flex flex-col items-center justify-center",
        size === "default" && "min-h-[200px] gap-8",
        size === "sm" && "min-h-0 gap-0",
        className
      )}
    >
      {spinner}

      {showText && (
        <div className="flex h-8 flex-col items-center justify-center gap-1">
          <span
            key={loadingText}
            className="
              animate-in fade-in slide-in-from-bottom-2 duration-500
              text-[10px] font-medium uppercase tracking-[0.3em]
              text-emerald-700
              dark:text-cyan-200/70
            "
          >
            {loadingText}
          </span>
        </div>
      )}
    </div>
  )
}
