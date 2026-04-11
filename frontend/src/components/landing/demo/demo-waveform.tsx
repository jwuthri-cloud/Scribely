"use client"

import { useEffect, useRef } from "react"

const BAR_COUNT = 48
const MIN_HEIGHT = 2
const MAX_HEIGHT_MIC = 22
const MAX_HEIGHT_SYS = 16

export function DemoWaveform() {
  const micCanvasRef = useRef<HTMLCanvasElement>(null)
  const sysCanvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)

  useEffect(() => {
    let running = true

    function draw() {
      if (!running) return
      frameRef.current++

      const drawBars = (
        canvas: HTMLCanvasElement | null,
        maxH: number,
        color: string,
        speed: number,
        offset: number
      ) => {
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height
        ctx.clearRect(0, 0, w, h)

        const barW = w / BAR_COUNT - 1
        const t = frameRef.current * speed

        for (let i = 0; i < BAR_COUNT; i++) {
          const noise =
            Math.sin(t * 0.05 + i * 0.3 + offset) *
            Math.cos(t * 0.03 + i * 0.7) *
            Math.sin(t * 0.02 + i * 0.15 + 2)
          const barH = MIN_HEIGHT + ((noise + 1) / 2) * (maxH - MIN_HEIGHT)
          const x = i * (barW + 1)
          const y = (h - barH) / 2

          ctx.fillStyle = color
          ctx.globalAlpha = 0.6 + ((noise + 1) / 2) * 0.4
          ctx.beginPath()
          ctx.roundRect(x, y, barW, barH, 1)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      drawBars(micCanvasRef.current, MAX_HEIGHT_MIC, "#88c0d0", 1, 0)
      drawBars(sysCanvasRef.current, MAX_HEIGHT_SYS, "#a3be8c", 0.8, 5)

      requestAnimationFrame(draw)
    }

    requestAnimationFrame(draw)
    return () => {
      running = false
    }
  }, [])

  return (
    <div className="px-3 pb-1 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9px] uppercase tracking-wider w-6 shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          MIC
        </span>
        <canvas
          ref={micCanvasRef}
          width={320}
          height={28}
          className="w-full h-7"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9px] uppercase tracking-wider w-6 shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          SYS
        </span>
        <canvas
          ref={sysCanvasRef}
          width={320}
          height={22}
          className="w-full h-5"
        />
      </div>
    </div>
  )
}
