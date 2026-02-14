import { useRef, useEffect, useState } from 'react'
import type { ChatMessage } from '../types'
import type { HotkeyConfig, ModelId } from '../types/settings'
import { DEFAULT_HOTKEYS, MODEL_CONFIGS, estimateMessageCost } from '../types/settings'
import { MarkdownContent } from './MarkdownContent'

/** Converts an Electron accelerator to macOS-style symbols */
function fmtKey(acc: string): string {
  return acc
    .replace(/CommandOrControl|Command/g, '⌘')
    .replace(/Control/g, '⌃')
    .replace(/Alt/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, '')
}

/** Hotkeys to show on the main page (exclude directional moves) */
const VISIBLE_HOTKEYS: { key: keyof HotkeyConfig; label: string; icon: React.ReactNode }[] = [
  {
    key: 'toggleOverlay',
    label: 'Toggle overlay',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'takeScreenshot',
    label: 'Screenshot',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'toggleAudio',
    label: 'Voice input',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 19v3" />
      </svg>
    ),
  },
  {
    key: 'resetChat',
    label: 'Reset chat',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 4v6h6" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    ),
  },
  {
    key: 'toggleMeeting',
    label: 'Toggle meeting',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },  
]

interface ResponseCardProps {
  messages: ChatMessage[]
  isLoading: boolean
}

const TRUNCATE_LENGTH = 8000

export function ResponseCard({ messages, isLoading }: ResponseCardProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT_HOTKEYS)
  const [promptModal, setPromptModal] = useState<{
    requestId: string
    messages: Array<{ role: string; content: string }>
  } | null>(null)
  const [promptExpandedIndices, setPromptExpandedIndices] = useState<Set<number>>(new Set())

  // Load actual hotkey config
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      if (s?.hotkeys) setHotkeys(s.hotkeys)
    })
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center px-5">
        <div className="w-full max-w-[260px] space-y-4">
          {/* Logo / brand */}
          <div className="text-center space-y-1.5">
            <div
              className="text-lg font-semibold tracking-tight select-none"
              style={{ color: 'var(--text-bright)' }}
            >
              AssistMe
            </div>
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              Type a message, pick an action, or use a shortcut
            </p>
          </div>

          {/* Hotkey reference */}
          <div
            className="rounded-xl p-2.5 space-y-0.5"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
            }}
          >
            {VISIBLE_HOTKEYS.map(({ key, label, icon }) => (
              <div
                key={key}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{icon}</span>
                  <span className="text-[11px]">{label}</span>
                </div>
                <kbd
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wide"
                  style={{
                    backgroundColor: 'var(--chip-bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {fmtKey(hotkeys[key])}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Determine if the last assistant message is still streaming
  const lastMsg = messages[messages.length - 1]
  const isStreaming = isLoading && lastMsg?.role === 'assistant' && !lastMsg.isError

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg) => {
        // For user messages, display rawQuery (the clean question) instead of
        // the full content that includes transcript deltas
        const displayText =
          msg.role === 'user' && msg.rawQuery ? msg.rawQuery : msg.content

        return (
          <div
            key={msg.id}
            className={`text-sm leading-relaxed rounded-xl px-3 py-2 max-w-[90%] ${
              msg.role === 'user' ? 'ml-auto' : ''
            }`}
            style={{
              color: msg.isError
                ? 'var(--error)'
                : msg.role === 'assistant'
                  ? 'var(--text-bright)'
                  : 'var(--text)',
              backgroundColor:
                msg.role === 'user' ? 'var(--surface-hover)' : 'transparent',
            }}
          >
            {/* Render image attachments */}
            {msg.attachments?.map((att, idx) => (
              <div key={idx} className="mb-2">
                {att.type === 'image' && (
                  <img
                    src={att.data}
                    alt={att.label || 'Attachment'}
                    className="rounded-lg max-h-40 object-cover border"
                    style={{ borderColor: 'var(--border)' }}
                  />
                )}
                {att.label && (
                  <span
                    className="text-[10px] mt-0.5 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {att.label}
                  </span>
                )}
              </div>
            ))}

            {/* Message content */}
            {msg.role === 'assistant' && !msg.isError ? (
              <div className="max-w-none">
                <MarkdownContent
                  content={displayText}
                  color="var(--text-bright)"
                />
              </div>
            ) : (
              <span className="whitespace-pre-wrap">{displayText}</span>
            )}

            {/* Streaming cursor */}
            {isStreaming && msg === lastMsg && (
              <span
                className="inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 animate-pulse rounded-sm"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}

            {/* Model badge, latency, and cost for assistant messages */}
            {msg.role === 'assistant' && msg.model && !msg.isError && (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {MODEL_CONFIGS[msg.model as ModelId]?.label ?? msg.model}
                </span>
                {msg.usage?.latencyMs != null && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {msg.usage.latencyMs >= 1000
                      ? `${(msg.usage.latencyMs / 1000).toFixed(1)}s`
                      : `${msg.usage.latencyMs}ms`}
                  </span>
                )}
                {msg.usage && msg.usage.cachedTokens > 0 && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)',
                      color: 'var(--success)',
                    }}
                  >
                    {Math.round((msg.usage.cachedTokens / msg.usage.promptTokens) * 100)}% cached
                  </span>
                )}
                {msg.usage && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    ~${estimateMessageCost(msg.usage, msg.model as ModelId).toFixed(4)}
                  </span>
                )}
                <button
                  onClick={async () => {
                    const prompt = await window.electronAPI?.llmGetPromptForRequest?.(msg.id)
                    if (prompt) {
                      setPromptExpandedIndices(new Set())
                      setPromptModal({ requestId: msg.id, messages: prompt })
                    }
                  }}
                  className="p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Show full prompt"
                  aria-label="Show full prompt"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                </button>
              </div>
            )}

            {/* Retry hint for retryable errors */}
            {msg.isError && msg.retryable && (
              <div
                className="text-[10px] mt-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Try again in a moment.
              </div>
            )}
          </div>
        )
      })}

      {/* Full prompt modal */}
      {promptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setPromptModal(null)}
        >
          <div
            className="rounded-xl border shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Full prompt sent to model
              </h3>
              <button
                onClick={() => setPromptModal(null)}
                className="p-1 rounded-lg hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-4 space-y-4 text-[12px]"
              style={{ color: 'var(--text)' }}
            >
              {promptModal.messages.map((m, i) => {
                const isLong = m.content.length > TRUNCATE_LENGTH
                const expanded = promptExpandedIndices.has(i)
                const displayContent = isLong && !expanded
                  ? m.content.slice(0, TRUNCATE_LENGTH) + '\n\n… truncated'
                  : m.content
                return (
                  <div key={i} className="space-y-1">
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        color:
                          m.role === 'system'
                            ? 'var(--accent)'
                            : m.role === 'user'
                              ? 'var(--text)'
                              : 'var(--success)',
                      }}
                    >
                      [{m.role}]
                    </div>
                    <pre
                      className="whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed rounded-lg p-2 overflow-x-auto"
                      style={{
                        backgroundColor: 'var(--input-bg)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {displayContent}
                    </pre>
                    {isLong && !expanded && (
                      <button
                        onClick={() =>
                          setPromptExpandedIndices((prev) => new Set(prev).add(i))
                        }
                        className="text-[10px] underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        Show full ({m.content.length.toLocaleString()} chars)
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Loading dots when waiting for first chunk */}
      {isLoading && (!lastMsg || lastMsg.role !== 'assistant') && (
        <div
          className="flex gap-1.5 items-center px-3 py-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse [animation-delay:150ms]"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse [animation-delay:300ms]"
            style={{ backgroundColor: 'var(--accent)' }}
          />
        </div>
      )}
    </div>
  )
}
