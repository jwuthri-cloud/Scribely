import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'

/** Icon IDs available for quick action chips */
export const QUICK_ACTION_ICON_IDS = [
  'list',
  'checklist',
  'explain',
  'wrench',
  'pencil',
  'code',
  'document',
  'chat',
  'star',
  'plus',
] as const

export type QuickActionIconId = (typeof QUICK_ACTION_ICON_IDS)[number]

const ICON_SVGS: Record<QuickActionIconId, ReactNode> = {
  list: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  ),
  checklist: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  explain: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  wrench: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  pencil: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  code: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  document: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  ),
  chat: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  star: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  plus: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
}

const DEFAULT_ICON_BY_VALUE: Record<string, QuickActionIconId> = {
  'List the action items from this meeting': 'checklist',
  'Explain this': 'explain',
  'Fix this code': 'wrench',
  'Rewrite this': 'pencil',
}

export function getQuickActionIcon(iconId?: string | null, fallbackValue?: string): ReactNode {
  if (iconId && iconId in ICON_SVGS) {
    return ICON_SVGS[iconId as QuickActionIconId]
  }
  const fallbackId = fallbackValue ? DEFAULT_ICON_BY_VALUE[fallbackValue] : 'pencil'
  return ICON_SVGS[fallbackId] ?? ICON_SVGS.pencil
}

const ICON_LABELS: Record<QuickActionIconId, string> = {
  list: 'List',
  checklist: 'Checklist',
  explain: 'Explain',
  wrench: 'Wrench',
  pencil: 'Pencil',
  code: 'Code',
  document: 'Document',
  chat: 'Chat',
  star: 'Star',
  plus: 'Plus',
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (iconId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selectedId = (value && value in ICON_SVGS ? value : 'pencil') as QuickActionIconId

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-colors"
        style={{
          backgroundColor: 'var(--input-bg)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        <span style={{ opacity: 0.8 }}>{ICON_SVGS[selectedId]}</span>
        <span>{ICON_LABELS[selectedId]}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={open ? 'rotate-180' : ''}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 py-1 rounded-lg border shadow-lg z-[9999] max-h-48 overflow-y-auto"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            minWidth: '120px',
          }}
        >
          {QUICK_ACTION_ICON_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onChange(id)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
              style={{
                color: selectedId === id ? 'var(--accent)' : 'var(--text)',
              }}
            >
              <span style={{ opacity: 0.8 }}>{ICON_SVGS[id]}</span>
              {ICON_LABELS[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
