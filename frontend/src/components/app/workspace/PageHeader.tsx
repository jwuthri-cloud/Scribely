"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { WorkspaceSurface } from "@/components/app/workspace/WorkspaceSurface"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <WorkspaceSurface
      className={cn("relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7", className)}
      variant="card"
    >
      <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-violet-500/12 blur-3xl" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-cyan-200/75">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-white/58 sm:text-[15px]">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="relative flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
      </div>
    </WorkspaceSurface>
  )
}
