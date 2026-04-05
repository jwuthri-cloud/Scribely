"use client"

import { useEffect, useRef } from "react"

const GLOW_RADIUS_CELLS = 2.8
const FADE_DELAY_MS = 120
const FADE_DURATION_MS = 1400

/** Matches globals.css :root --workspace-grid-cell (background-position: center on .app-workspace-canvas). */
function readGridCellPx(): number {
  if (typeof document === "undefined") return 28
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--workspace-grid-cell").trim()
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 28
}

export function CursorGridEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const lastMoveRef = useRef(0)
  const opacityRef = useRef(0)
  const rafRef = useRef<number>(0)
  const mainElRef = useRef<HTMLElement | null>(null)

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

    mainElRef.current = document.querySelector<HTMLElement>(".app-workspace-canvas")

    const onMouseMove = (e: MouseEvent) => {
      const el = mainElRef.current ?? document.querySelector<HTMLElement>(".app-workspace-canvas")
      if (el) mainElRef.current = el
      if (!el) return
      const br = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const bl = parseFloat(cs.borderLeftWidth) || 0
      const bt = parseFloat(cs.borderTopWidth) || 0
      const padL = br.left + bl
      const padT = br.top + bt
      const pw = el.clientWidth
      const ph = el.clientHeight
      const mx = e.clientX
      const my = e.clientY
      if (mx >= padL && mx <= padL + pw && my >= padT && my <= padT + ph) {
        mouseRef.current = { x: mx, y: my }
        lastMoveRef.current = Date.now()
      }
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

      const main = mainElRef.current ?? document.querySelector<HTMLElement>(".app-workspace-canvas")
      if (!main || opacityRef.current <= 0.005) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const cell = readGridCellPx()
      const br = main.getBoundingClientRect()
      const cs = getComputedStyle(main)
      const bl = parseFloat(cs.borderLeftWidth) || 0
      const bt = parseFloat(cs.borderTopWidth) || 0
      const padL = br.left + bl
      const padT = br.top + bt
      const pw = main.clientWidth
      const ph = main.clientHeight

      // Same as CSS background-position: center on padding box — tile center (cell/2, cell/2) at (pw/2, ph/2).
      const anchorLocalX = pw / 2 - cell / 2
      const anchorLocalY = ph / 2 - cell / 2

      const { x, y } = mouseRef.current
      const globalAlpha = opacityRef.current

      ctx.save()
      ctx.beginPath()
      ctx.rect(padL, padT, pw, ph)
      ctx.clip()

      const lx = x - padL
      const ly = y - padT
      const col0 = Math.floor((lx - anchorLocalX) / cell)
      const row0 = Math.floor((ly - anchorLocalY) / cell)
      const span = Math.ceil(GLOW_RADIUS_CELLS) + 1

      for (let dc = -span; dc <= span; dc++) {
        for (let dr = -span; dr <= span; dr++) {
          const col = col0 + dc
          const row = row0 + dr
          const cellX = padL + anchorLocalX + col * cell
          const cellY = padT + anchorLocalY + row * cell
          const cx = cellX + cell / 2
          const cy = cellY + cell / 2

          const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2) / cell
          if (dist > GLOW_RADIUS_CELLS) continue

          const t = Math.max(0, 1 - dist / GLOW_RADIUS_CELLS)
          const tSmooth = t * t * (3 - 2 * t)

          const borderAlpha = tSmooth * globalAlpha * 0.55
          ctx.strokeStyle = `rgba(200, 35, 35, ${borderAlpha})`
          ctx.lineWidth = 1
          ctx.strokeRect(cellX + 0.5, cellY + 0.5, cell - 1, cell - 1)

          const fillAlpha = tSmooth * tSmooth * globalAlpha * 0.18
          if (fillAlpha > 0.005) {
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.75)
            grad.addColorStop(0, `rgba(200, 25, 25, ${fillAlpha})`)
            grad.addColorStop(1, `rgba(100, 10, 10, 0)`)
            ctx.fillStyle = grad
            ctx.fillRect(cellX, cellY, cell, cell)
          }
        }
      }

      ctx.restore()

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
