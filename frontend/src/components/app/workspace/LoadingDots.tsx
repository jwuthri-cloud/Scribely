"use client"

import { cn } from "@/lib/utils"

export function LoadingDots({
  className,
  dotClassName,
}: {
  className?: string
  dotClassName?: string
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className={cn(
            "h-2.5 w-2.5 animate-bounce rounded-full bg-cyan-300/90 [animation-delay:0ms]",
            dot === 1 && "[animation-delay:120ms]",
            dot === 2 && "[animation-delay:240ms]",
            dotClassName
          )}
        />
      ))}
    </div>
  )
}
