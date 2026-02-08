import { useState, useRef, type FormEvent } from 'react'

interface InputBarProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    // Re-focus input after send
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 shrink-0">
      <div
        className="flex items-center rounded-xl px-3 py-2.5 border transition-colors focus-within:border-[var(--accent)]"
        style={{
          backgroundColor: 'var(--input-bg)',
          borderColor: 'var(--input-border)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask anything…"
          disabled={disabled}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
          autoFocus
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="ml-2 text-xs font-medium px-3 py-1 rounded-lg transition-all duration-150 disabled:opacity-30 hover:brightness-110 active:scale-95"
          style={{
            backgroundColor: 'var(--accent)',
            color: '#fff',
          }}
        >
          ↑
        </button>
      </div>
    </form>
  )
}
