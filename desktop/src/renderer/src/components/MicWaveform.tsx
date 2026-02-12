import { useEffect, useRef, useCallback } from 'react'

interface MicWaveformProps {
  /** Current mic level 0-1, updated every audio frame */
  level: number
  /** Whether actively recording */
  isActive: boolean
  height?: number
}

const BUFFER_SIZE = 80 // ~6-7 sec at ~12 samples/sec
const TARGET_FPS = 30

/**
 * Compact sound-wave visualizer for the mic-to-prompt recording.
 * Single channel — bars go both up and down from center (mirrored).
 */
export function MicWaveform({ level, isActive, height = 28 }: MicWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const buffer = useRef<number[]>(new Array(BUFFER_SIZE).fill(0))
  const animRef = useRef<number>(0)
  const lastDraw = useRef<number>(0)

  // Push new level into buffer
  useEffect(() => {
    if (!isActive) return
    buffer.current.push(level)
    if (buffer.current.length > BUFFER_SIZE) buffer.current.shift()
  }, [level, isActive])

  // Reset on deactivate
  useEffect(() => {
    if (!isActive) {
      buffer.current = new Array(BUFFER_SIZE).fill(0)
    }
  }, [isActive])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const now = performance.now()
    if (now - lastDraw.current < 1000 / TARGET_FPS) {
      animRef.current = requestAnimationFrame(draw)
      return
    }
    lastDraw.current = now

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }

    ctx.clearRect(0, 0, w, h)

    const midY = h / 2
    const data = buffer.current
    const len = data.length
    const gap = w / len
    const barW = Math.max(1.5, gap * 0.55)
    const maxAmp = midY * 0.9

    // Read accent color
    const cs = getComputedStyle(canvas)
    const accent = cs.getPropertyValue('--error').trim() || '#e06c75'

    // Center line
    ctx.strokeStyle = 'rgba(128,128,128,0.1)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, midY)
    ctx.lineTo(w, midY)
    ctx.stroke()

    // Draw mirrored bars
    for (let i = 0; i < len; i++) {
      const x = i * gap
      const val = smooth3(data, i)
      if (val < 0.005) continue

      const barH = val * maxAmp
      const alpha = 0.35 + val * 0.65

      ctx.fillStyle = rgba(accent, alpha)

      // Top half (up from center)
      ctx.beginPath()
      roundedRect(ctx, x - barW / 2, midY - barH, barW, barH, Math.min(barW / 2, 1))
      ctx.fill()

      // Bottom half (mirrored down)
      ctx.beginPath()
      roundedRect(ctx, x - barW / 2, midY, barW, barH, Math.min(barW / 2, 1))
      ctx.fill()
    }

    animRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    if (isActive) {
      animRef.current = requestAnimationFrame(draw)
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [isActive, draw])

  if (!isActive) return null

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded"
      style={{ height: `${height}px` }}
    />
  )
}

function smooth3(data: number[], i: number): number {
  const p = data[Math.max(0, i - 1)]
  const c = data[i]
  const n = data[Math.min(data.length - 1, i + 1)]
  return p * 0.25 + c * 0.5 + n * 0.25
}

function rgba(color: string, a: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `,${a})`)
  }
  return color
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  r = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}
