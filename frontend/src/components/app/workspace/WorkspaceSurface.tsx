"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export function WorkspaceSurface({
  className,
  children,
  variant = "card",
}: {
  className?: string
  children: React.ReactNode
  variant?: "card" | "panel"
}) {
  return (
    <div className={cn(variant === "card" ? "workspace-card" : "workspace-panel", className)}>
      {children}
    </div>
  )
}
