import { useEffect, useRef, useCallback } from 'react'

interface AudioWaveformProps {
  isActive: boolean
  height?: number
}

/** 10-second window at ~12.5 samples/sec (one every 80ms from pipeline) */
const WINDOW_SECONDS = 10
const SAMPLES_PER_SEC = 12.5
const BUFFER_SIZE = Math.ceil(WINDOW_SECONDS * SAMPLES_PER_SEC) // ~125
const TARGET_FPS = 30

export function AudioWaveform({ isActive, height = 44 }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const micBuf = useRef<number[]>(new Array(BUFFER_SIZE).fill(0))
  const sysBuf = useRef<number[]>(new Array(BUFFER_SIZE).fill(0))
  const animRef = useRef<number>(0)
  const lastDraw = useRef<number>(0)

  // Subscribe to audio levels
  useEffect(() => {
    if (!isActive) return
    const unsub = window.electronAPI?.onAudioLevels?.((levels) => {
      micBuf.current.push(levels.mic)
      sysBuf.current.push(levels.system)
      if (micBuf.current.length > BUFFER_SIZE) micBuf.current.shift()
      if (sysBuf.current.length > BUFFER_SIZE) sysBuf.current.shift()
    })
    return () => { unsub?.() }
  }, [isActive])

  // Reset on deactivate
  useEffect(() => {
    if (!isActive) {
      micBuf.current = new Array(BUFFER_SIZE).fill(0)
      sysBuf.current = new Array(BUFFER_SIZE).fill(0)
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
    const mic = micBuf.current
    const sys = sysBuf.current
    const len = mic.length

    // Distinct colors: bright cyan for mic, orange for system
    const accent = '#00d4ff'
    const success = '#ff8c00'

    // ── Center line ───────────────────────────────
    ctx.strokeStyle = 'rgba(128,128,128,0.12)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, midY)
    ctx.lineTo(w, midY)
    ctx.stroke()

    // ── Bar width ─────────────────────────────────
    const barW = Math.max(1.5, (w / len) * 0.6)
    const gap = w / len
    const maxAmp = midY * 0.88

    // ── Draw bars ─────────────────────────────────
    for (let i = 0; i < len; i++) {
      const x = i * gap

      // Smooth values
      const mVal = smooth3(mic, i)
      const sVal = smooth3(sys, i)

      // Mic: bars go UP from center (accent)
      if (mVal > 0.005) {
        const barH = mVal * maxAmp
        const alpha = 0.4 + mVal * 0.6
        ctx.fillStyle = rgba(accent, alpha)
        // Draw rounded-ish bar
        ctx.beginPath()
        roundedRect(ctx, x - barW / 2, midY - barH, barW, barH, Math.min(barW / 2, 1))
        ctx.fill()
      }

      // System: bars go DOWN from center (green)
      if (sVal > 0.005) {
        const barH = sVal * maxAmp
        const alpha = 0.4 + sVal * 0.6
        ctx.fillStyle = rgba(success, alpha)
        ctx.beginPath()
        roundedRect(ctx, x - barW / 2, midY, barW, barH, Math.min(barW / 2, 1))
        ctx.fill()
      }
    }

    // ── Labels ────────────────────────────────────
    ctx.font = '8px system-ui, sans-serif'
    ctx.fillStyle = rgba(accent, 0.5)
    ctx.fillText('MIC', 3, 9)
    ctx.fillStyle = rgba(success, 0.5)
    ctx.fillText('SYS', 3, h - 3)

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

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{
        height: `${height}px`,
        display: isActive ? 'block' : 'none',
      }}
    />
  )
}

// ── Helpers ──────────────────────────────────────────

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
