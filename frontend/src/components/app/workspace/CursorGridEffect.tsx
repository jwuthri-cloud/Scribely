"use client"

import { useEffect, useRef } from "react"

const CELL_SIZE = 72
const GLOW_RADIUS_CELLS = 2.8
const FADE_DELAY_MS = 120
const FADE_DURATION_MS = 1400

export function CursorGridEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const lastMoveRef = useRef(0)
  const opacityRef = useRef(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
      lastMoveRef.current = Date.now()
    }
    window.addEventListener("mousemove", onMouseMove)

    const draw = () => {
      const now = Date.now()
      const idle = now - lastMoveRef.current

      if (idle < FADE_DELAY_MS) {
        opacityRef.current = Math.min(opacityRef.current + 0.08, 1)
      } else {
        const progress = (idle - FADE_DELAY_MS) / FADE_DURATION_MS
        opacityRef.current = Math.max(0, 1 - progress)
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (opacityRef.current > 0.005) {
        const { x, y } = mouseRef.current
        const globalAlpha = opacityRef.current

        const col0 = Math.floor(x / CELL_SIZE)
        const row0 = Math.floor(y / CELL_SIZE)
        const span = Math.ceil(GLOW_RADIUS_CELLS) + 1

        for (let dc = -span; dc <= span; dc++) {
          for (let dr = -span; dr <= span; dr++) {
            const col = col0 + dc
            const row = row0 + dr
            const cellX = col * CELL_SIZE
            const cellY = row * CELL_SIZE
            const cx = cellX + CELL_SIZE / 2
            const cy = cellY + CELL_SIZE / 2

            const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2) / CELL_SIZE
            if (dist > GLOW_RADIUS_CELLS) continue

            // Smooth falloff: 1 at center, 0 at radius
            const t = Math.max(0, 1 - dist / GLOW_RADIUS_CELLS)
            const tSmooth = t * t * (3 - 2 * t) // smoothstep

            // Border glow
            const borderAlpha = tSmooth * globalAlpha * 0.55
            ctx.strokeStyle = `rgba(200, 35, 35, ${borderAlpha})`
            ctx.lineWidth = 1
            ctx.strokeRect(cellX + 0.5, cellY + 0.5, CELL_SIZE - 1, CELL_SIZE - 1)

            // Inner radial fill
            const fillAlpha = tSmooth * tSmooth * globalAlpha * 0.18
            if (fillAlpha > 0.005) {
              const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, CELL_SIZE * 0.75)
              grad.addColorStop(0, `rgba(200, 25, 25, ${fillAlpha})`)
              grad.addColorStop(1, `rgba(100, 10, 10, 0)`)
              ctx.fillStyle = grad
              ctx.fillRect(cellX, cellY, CELL_SIZE, CELL_SIZE)
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[2]"
    />
  )
}
