import { useRef, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ChatMessage } from '../types'
import type { HotkeyConfig, ModelId } from '../types/settings'
import { DEFAULT_HOTKEYS, MODEL_CONFIGS, estimateMessageCost } from '../types/settings'
import { migrateLegacyOpenAIModelId } from '../../../shared/openai-models'
import { MarkdownContent } from './MarkdownContent'

/** Example prompts shown in the empty state */
const EXAMPLE_PROMPTS: string[] = [
  // 'Explain this in simple terms',
  // 'Summarize the key points',
]

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
  /** Called when user clicks an example prompt in the empty state */
  onSend?: (message: string) => void
}

const TRUNCATE_LENGTH = 8000

const QUICK_START_STORAGE_KEY = 'scribely-desktop-quick-start-seen'

import appIconUrl from '../assets/app-icon.png'

function EmptyStateIllustration() {
  return (
    <div className="flex justify-center empty-state-illustration">
      <img
        src={appIconUrl}
        alt=""
        className="w-8 h-8 object-contain rounded-lg"
        width={32}
        height={32}
      />
    </div>
  )
}

function EmptyState({
  onSend,
  hotkeys,
  fmtKey,
  visibleHotkeys,
}: {
  onSend?: (message: string) => void
  hotkeys: HotkeyConfig
  fmtKey: (acc: string) => string
  visibleHotkeys: typeof VISIBLE_HOTKEYS
}) {
  const [showQuickStart, setShowQuickStart] = useState(() => {
    try {
      return !localStorage.getItem(QUICK_START_STORAGE_KEY)
    } catch {
      return false
    }
  })

  const dismissQuickStart = () => {
    try {
      localStorage.setItem(QUICK_START_STORAGE_KEY, '1')
      setShowQuickStart(false)
    } catch {
      setShowQuickStart(false)
    }
  }

  const toggleKey = hotkeys.toggleOverlay ? fmtKey(hotkeys.toggleOverlay) : '⌥T'

  return (
    <div className="flex-1 flex items-center justify-center px-5">
      <div className="w-full max-w-[280px] space-y-4">
        {/* Logo, tagline, illustration */}
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <EmptyStateIllustration />
          <div className="space-y-0.5">
            <div
              className="font-semibold tracking-tight select-none"
              style={{ color: 'var(--text-bright)', fontSize: 'calc(var(--font-size-base) * 1.2)' }}
            >
              Scribely
            </div>
            {/* <p
              className="leading-relaxed"
              style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}
            >
              Your AI assistant, always on top
            </p> */}
          </div>
        </motion.div>

        {/* Example prompts */}
        {onSend && (
          <motion.div
            className="flex flex-wrap gap-1.5 justify-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {EXAMPLE_PROMPTS.map((prompt, i) => (
              <button
                key={prompt}
                onClick={() => onSend(prompt)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--chip-bg)',
                  color: 'var(--chip-text)',
                  border: '1px solid var(--border)',
                }}
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}

        {/* Hotkey reference (hidden for now) */}
        {false && (
        <motion.div
            className="rounded-xl p-2.5 space-y-0.5"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
          >
            {visibleHotkeys.map(({ key, label, icon }, i) => (
              <motion.div
                key={key}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.2 + i * 0.04 }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{icon}</span>
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>{label}</span>
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
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Quick start tip on first open */}
        {/* <AnimatePresence>
          {showQuickStart && (
            <motion.div
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, delay: 0.4 }}
            >
              <span className="text-[10px]" style={{ color: 'var(--accent)' }}>
                Quick start: {toggleKey} toggles overlay from anywhere
              </span>
              <button
                onClick={dismissQuickStart}
                className="p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors shrink-0"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Dismiss tip"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence> */}
      </div>
    </div>
  )
}

export function ResponseCard({ messages, isLoading, onSend }: ResponseCardProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT_HOTKEYS)
  const [promptModal, setPromptModal] = useState<{
    requestId: string
    messages: Array<{ role: string; content: string }>
    attachmentCount: number
  } | null>(null)
  const [promptExpandedIndices, setPromptExpandedIndices] = useState<Set<number>>(new Set())
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)

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

  // Close prompt modal on Escape
  useEffect(() => {
    if (!promptModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPromptModal(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [promptModal])

  if (messages.length === 0 && !isLoading) {
    return (
      <EmptyState
        onSend={onSend}
        hotkeys={hotkeys}
        fmtKey={fmtKey}
        visibleHotkeys={VISIBLE_HOTKEYS}
      />
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
            className={`leading-relaxed rounded-xl px-3 py-2 max-w-[90%] ${
              msg.role === 'user' ? 'ml-auto' : ''
            }`}
            style={{
              fontSize: 'var(--font-size-base)',
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
                  onListItemClick={
                    msg.isFollowUp && onSend
                      ? (text) => onSend(text)
                      : undefined
                  }
                />
              </div>
            ) : (
              <span className="whitespace-pre-wrap">{displayText}</span>
            )}

            {/* Web Search badge + sources (same row as model/latency) */}
            {msg.role === 'assistant' && msg.isWebSearch && (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, #3b82f6 18%, transparent)',
                    color: '#60a5fa',
                  }}
                >
                  Web Search
                </span>
                {msg.webSources && msg.webSources.length > 0 ? (
                  msg.webSources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] px-1.5 py-0.5 rounded-md truncate max-w-[140px] hover:underline block"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                        color: 'var(--accent)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title={s.title}
                    >
                      {s.title}
                    </a>
                  ))
                ) : (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    No sources
                  </span>
                )}
              </div>
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
                  {MODEL_CONFIGS[migrateLegacyOpenAIModelId(msg.model) as ModelId]?.label ?? msg.model}
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
                    {estimateMessageCost(msg.usage, msg.model) > 0
                      ? `~$${estimateMessageCost(msg.usage, msg.model).toFixed(4)}`
                      : 'Free'}
                  </span>
                )}
                <button
                  onClick={async () => {
                    await window.electronAPI?.clipboardWriteText?.(displayText)
                    setCopiedMsgId(msg.id)
                    setTimeout(() => setCopiedMsgId(null), 1500)
                  }}
                  className="p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ color: copiedMsgId === msg.id ? 'var(--success)' : 'var(--text-muted)' }}
                  title="Copy response"
                  aria-label="Copy response"
                >
                  {copiedMsgId === msg.id ? (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className="inline-flex"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </motion.span>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={async () => {
                    const result = await window.electronAPI?.llmGetPromptForRequest?.(msg.id)
                    if (result) {
                      setPromptExpandedIndices(new Set())
                      setPromptModal({
                        requestId: msg.id,
                        messages: result.messages,
                        attachmentCount: result.attachmentCount,
                      })
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="prompt-modal-title"
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
              <h3 id="prompt-modal-title" className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
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
                const isLastUser =
                  m.role === 'user' &&
                  i === promptModal.messages.findLastIndex((msg) => msg.role === 'user')
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
                    {isLastUser && promptModal.attachmentCount > 0 && (
                      <div
                        className="text-[10px] px-2 py-1 rounded-md inline-flex items-center gap-1"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          color: 'var(--accent)',
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        {promptModal.attachmentCount} image{promptModal.attachmentCount > 1 ? 's' : ''} attached — sent to model
                      </div>
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
