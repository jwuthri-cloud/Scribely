import { useState, useEffect, useRef } from 'react'
import type { HotkeyConfig } from '../types/settings'
import { DEFAULT_HOTKEYS, HOTKEY_LABELS } from '../types/settings'

/** Converts Electron accelerator to macOS-style symbols */
function fmtKey(acc: string): string {
  return acc
    .replace(/CommandOrControl|Command/g, '⌘')
    .replace(/Control/g, '⌃')
    .replace(/Alt/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, '')
}

const HOTKEY_ITEMS: {
  key: keyof HotkeyConfig
  description: string
}[] = [
  { key: 'toggleOverlay', description: 'Hide or show the overlay window' },
  { key: 'focusChatInput', description: 'Focus the Ask anything input' },
  { key: 'quickAction1', description: 'Send the first quick action prompt' },
  { key: 'takeScreenshot', description: 'Capture the current screen' },
  { key: 'toggleAudio', description: 'Start or stop voice input / microphone recording' },
  { key: 'resetChat', description: 'Clear the conversation' },
  { key: 'toggleMeeting', description: 'Start or stop meeting capture and recording' },
  { key: 'moveUp', description: 'Move window up' },
  { key: 'moveDown', description: 'Move window down' },
  { key: 'moveLeft', description: 'Move window left' },
  { key: 'moveRight', description: 'Move window right' },
]

interface HotkeyMenuProps {
  /** Button size: 'sm' for compact (w-6 h-6), 'md' for advanced (w-6 h-6) */
  size?: 'sm' | 'md'
  /** Tooltip for the trigger button */
  tooltip?: string
}

export function HotkeyMenu({ size = 'md', tooltip = 'Keyboard shortcuts' }: HotkeyMenuProps) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT_HOTKEYS)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      if (s?.hotkeys) setHotkeys(s.hotkeys)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div
      className="relative"
      ref={menuRef}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={`flex items-center justify-center rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)] ${size === 'sm' ? 'w-6 h-6' : 'w-6 h-6'}`}
        style={{ color: 'var(--text-muted)' }}
        onClick={() => setOpen((o) => !o)}
        aria-label={tooltip}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12" />
        </svg>
      </button>
      {hovered && !open && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none z-[9999]"
          style={{
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          {tooltip}
        </div>
      )}

      {open && (
        <div
          className="absolute right-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-[9999] min-w-[200px] flex flex-col max-h-[min(70vh,320px)]"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Shortcuts
            </span>
          </div>
          <div className="overflow-y-auto overflow-x-hidden py-1">
          {HOTKEY_ITEMS.map(({ key, description }) => (
            <div
              key={key}
              className="flex flex-col gap-0.5 px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors cursor-default"
              title={description}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11px]" style={{ color: 'var(--text)' }}>
                  {HOTKEY_LABELS[key]}
                </span>
                <kbd
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--border) 50%, transparent)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {fmtKey(hotkeys[key] || DEFAULT_HOTKEYS[key])}
                </kbd>
              </div>
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {description}
              </span>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}
