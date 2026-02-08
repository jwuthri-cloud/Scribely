import { useRef, useEffect } from 'react'
import type { ChatMessage } from '../types'

interface ResponseCardProps {
  messages: ChatMessage[]
  isLoading: boolean
}

export function ResponseCard({ messages, isLoading }: ResponseCardProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <div
            className="text-2xl opacity-40 select-none"
            style={{ color: 'var(--text-muted)' }}
          >
            ✦
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            Press{' '}
            <kbd
              className="px-1.5 py-0.5 rounded text-[11px] font-mono"
              style={{
                backgroundColor: 'var(--chip-bg)',
                color: 'var(--chip-text)',
                border: '1px solid var(--border)',
              }}
            >
              ⌘⇧Space
            </kbd>{' '}
            to toggle
          </p>
          <p
            className="text-xs"
            style={{ color: 'var(--text-muted)', opacity: 0.7 }}
          >
            Type a message or pick an action below
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`text-sm leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-2 max-w-[90%] ${
            msg.role === 'user' ? 'ml-auto' : ''
          }`}
          style={{
            color:
              msg.role === 'assistant'
                ? 'var(--text-bright)'
                : 'var(--text)',
            backgroundColor:
              msg.role === 'user'
                ? 'var(--surface-hover)'
                : 'transparent',
          }}
        >
          {msg.content}
        </div>
      ))}
      {isLoading && (
        <div
          className="flex gap-1.5 items-center px-3 py-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
          <span className="w-1.5 h-1.5 rounded-full animate-pulse [animation-delay:150ms]" style={{ backgroundColor: 'var(--accent)' }} />
          <span className="w-1.5 h-1.5 rounded-full animate-pulse [animation-delay:300ms]" style={{ backgroundColor: 'var(--accent)' }} />
        </div>
      )}
    </div>
  )
}
