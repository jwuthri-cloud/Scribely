import { useState, useCallback, useRef, useEffect } from 'react'

interface HotkeyRecorderProps {
  value: string
  defaultValue: string
  onChange: (accelerator: string) => void
}

/**
 * Maps a KeyboardEvent to an Electron-compatible accelerator string.
 * e.g. "Alt+Shift+K", "CommandOrControl+S"
 */
function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []

  if (e.metaKey) parts.push('Command')
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  // Map the key code to a readable key name
  const key = codeToKey(e.code, e.key)
  if (!key) return null // modifier-only press

  parts.push(key)
  return parts.join('+')
}

function codeToKey(code: string, key: string): string | null {
  // Ignore modifier-only keys
  if (
    ['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight'].includes(
      code,
    )
  ) {
    return null
  }

  // Letters
  if (code.startsWith('Key')) return code.slice(3)

  // Digits
  if (code.startsWith('Digit')) return code.slice(5)

  // Function keys
  if (code.startsWith('F') && /^F\d+$/.test(code)) return code

  // Arrow keys
  const arrowMap: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  }
  if (arrowMap[code]) return arrowMap[code]

  // Special keys
  const specialMap: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
  }

  return specialMap[code] || key || null
}

/** Converts an accelerator string to a display-friendly format for macOS */
function formatAccelerator(acc: string): string {
  return acc
    .replace(/Command/g, '\u2318')
    .replace(/Control/g, '\u2303')
    .replace(/Alt/g, '\u2325')
    .replace(/Shift/g, '\u21E7')
    .replace(/\+/g, '')
}

export function HotkeyRecorder({ value, defaultValue, onChange }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Escape cancels recording
      if (e.code === 'Escape') {
        setRecording(false)
        return
      }

      const acc = eventToAccelerator(e)
      if (acc) {
        onChange(acc)
        setRecording(false)
      }
    },
    [onChange],
  )

  useEffect(() => {
    if (recording) {
      window.addEventListener('keydown', handleKeyDown, true)
      return () => window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [recording, handleKeyDown])

  // Click outside cancels recording
  useEffect(() => {
    if (!recording) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setRecording(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [recording])

  return (
    <div className="flex items-center gap-2">
      <button
        ref={ref}
        type="button"
        onClick={() => setRecording((r) => !r)}
        className="px-2.5 py-1 rounded-lg text-xs font-mono transition-all duration-150 border min-w-[80px] text-center"
        style={{
          backgroundColor: recording ? 'rgba(97, 175, 239, 0.15)' : 'var(--input-bg)',
          borderColor: recording ? 'var(--accent)' : 'var(--input-border)',
          color: recording ? 'var(--accent)' : 'var(--text)',
          boxShadow: recording ? '0 0 0 1px var(--accent)' : 'none',
        }}
      >
        {recording ? 'Press keys...' : formatAccelerator(value)}
      </button>

      {value !== defaultValue && (
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="text-[10px] transition-colors hover:brightness-125"
          style={{ color: 'var(--text-muted)' }}
          title="Reset to default"
        >
          reset
        </button>
      )}
    </div>
  )
}
