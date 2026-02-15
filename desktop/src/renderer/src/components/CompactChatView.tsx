import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ChatMessage, ChatAttachment } from '../types'
import type { QuickAction } from '../types/settings'
import { DEFAULT_QUICK_ACTIONS } from '../types/settings'
import { getQuickActionIcon } from './QuickActionIcons'
import { MarkdownContent } from './MarkdownContent'
import { CompactNavbar } from './CompactNavbar'

type ViewId = 'chat' | 'llm' | 'settings'

/** Import empty-state illustration assets (same as ResponseCard) */
const emptyStateGif = import.meta.glob('../assets/empty-state.gif', {
  eager: true,
  query: '?url',
  import: 'default',
})
const emptyStateSvg = import.meta.glob('../assets/scribely-empty-state.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})
const EMPTY_STATE_IMAGE_URL =
  (Object.values(emptyStateGif)[0] as string | undefined) ??
  (Object.values(emptyStateSvg)[0] as string | undefined) ??
  null

interface CompactChatViewProps {
  messages: ChatMessage[]
  isLoading: boolean
  onSend: (content: string, attachments?: ChatAttachment[]) => void
  onStop: () => void
  meetingActive: boolean
  meetingDuration: string
  onToggleMeeting: () => void
  onSetView: (view: ViewId) => void
  onReset: () => void
  quickActions?: QuickAction[]
}

/**
 * Compact mode chat view — replaces ResponseCard + ActionChips + InputBar
 * when compact mode is active.
 *
 * Shows only the LAST user message + LAST AI response (not full history),
 * inline action links, and a minimal input bar.
 */
export function CompactChatView({
  messages,
  isLoading,
  onSend,
  onStop,
  meetingActive,
  meetingDuration,
  onToggleMeeting,
  onSetView,
  onReset,
  quickActions,
}: CompactChatViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')

  // Extract the last user message and last assistant message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')

  // Determine if the last assistant message is still streaming
  const lastMsg = messages[messages.length - 1]
  const isStreaming = isLoading && lastMsg?.role === 'assistant' && !lastMsg.isError

  const hasMessages = messages.length > 0

  const handleFocusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const handleClose = useCallback(() => {
    if (window.electronAPI?.quit) {
      window.electronAPI.quit()
    } else {
      window.close()
    }
  }, [])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const trimmed = inputValue.trim()
      if (!trimmed) return
      onSend(trimmed)
      setInputValue('')
      inputRef.current?.focus()
    },
    [inputValue, onSend],
  )

  const handleActionClick = useCallback(
    (actionValue: string) => {
      onSend(actionValue)
    },
    [onSend],
  )

  // Auto-scroll response area when streaming
  const responseRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [lastAssistantMsg?.content, isLoading])

  const actions = (quickActions?.length ? quickActions : DEFAULT_QUICK_ACTIONS).slice(0, 3)

  return (
    <div className="flex flex-col h-full">
      {/* ── Compact Navbar ── */}
      <CompactNavbar
        meetingActive={meetingActive}
        meetingDuration={meetingDuration}
        onToggleMeeting={onToggleMeeting}
        onFocusInput={handleFocusInput}
        onSetView={onSetView}
        onClose={handleClose}
      />

      {/* ── Thin separator ── */}
      <div
        className="mx-3 h-px shrink-0"
        style={{ backgroundColor: 'var(--border)', opacity: 0.4 }}
      />

      {/* ── Response Area ── */}
      <div ref={responseRef} className="flex-1 overflow-y-auto px-4 py-3">
        {!hasMessages && !isLoading ? (
          /* Empty state: centered logo */
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-2"
            >
              {EMPTY_STATE_IMAGE_URL ? (
                <img
                  src={EMPTY_STATE_IMAGE_URL}
                  alt=""
                  className="w-8 h-7 object-contain"
                  width={32}
                  height={28}
                />
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>
                  <svg width="32" height="28" viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h18a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8l-4 4V4z" />
                    <path d="M20 12h-4M20 16h-2" strokeWidth="1.2" />
                  </svg>
                </div>
              )}
              <span
                className="text-sm font-semibold tracking-tight"
                style={{ color: 'var(--text-bright)' }}
              >
                Scribely
              </span>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Last user message as blue pill (right-aligned) */}
            {lastUserMsg && (
              <motion.div
                className="flex justify-end"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  className="inline-block max-w-[85%] px-3 py-1.5 rounded-2xl text-[12px] leading-relaxed"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#fff',
                  }}
                >
                  {lastUserMsg.rawQuery || lastUserMsg.content}
                </div>
              </motion.div>
            )}

            {/* Last assistant message (large text, the hero) */}
            {lastAssistantMsg && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="leading-relaxed"
                style={{
                  fontSize: 'var(--font-size-base)',
                  color: lastAssistantMsg.isError ? 'var(--error)' : 'var(--text-bright)',
                }}
              >
                {lastAssistantMsg.isError ? (
                  <span className="whitespace-pre-wrap">{lastAssistantMsg.content}</span>
                ) : (
                  <div className="max-w-none">
                    <MarkdownContent
                      content={lastAssistantMsg.content}
                      color="var(--text-bright)"
                    />
                  </div>
                )}

                {/* Streaming cursor */}
                {isStreaming && lastAssistantMsg === lastMsg && (
                  <span
                    className="inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 animate-pulse rounded-sm"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                )}
              </motion.div>
            )}

            {/* Loading dots when waiting for first chunk */}
            {isLoading && (!lastMsg || lastMsg.role !== 'assistant') && (
              <div className="flex gap-1.5 items-center py-2">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{
                      backgroundColor: 'var(--accent)',
                      animationDelay: `${delay}ms`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Inline Action Links ── */}
      {hasMessages && !isLoading && (
        <div className="flex items-center gap-3 px-4 py-1.5 shrink-0 flex-wrap">
          {actions.map((action, i) => (
            <button
              key={action.value}
              onClick={() => handleActionClick(action.value)}
              className="flex items-center gap-1 text-[11px] transition-all duration-150 hover:brightness-125"
              style={{ color: 'var(--text-muted)' }}
            >
              <span style={{ opacity: 0.6 }}>
                {getQuickActionIcon(action.icon, action.value)}
              </span>
              <span className="hover:underline">{action.label}</span>
              {i < actions.length - 1 && (
                <span className="ml-2" style={{ color: 'var(--border)', opacity: 0.8 }}>
                  ·
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Compact Input ── */}
      <div className="px-4 pb-3 pt-1 shrink-0">
        <form onSubmit={handleSubmit}>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 border transition-all duration-150 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_1px_var(--accent)]"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--input-border)',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask anything about the screen or conversation"
              className="flex-1 min-w-0 bg-transparent outline-none text-[12px]"
              style={{
                color: 'var(--text)',
                caretColor: 'var(--accent)',
              }}
              autoFocus
            />

            {/* Send or Stop */}
            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-150 hover:brightness-110 active:scale-95 shrink-0"
                style={{
                  backgroundColor: 'var(--error)',
                  color: '#fff',
                }}
                title="Stop generation"
              >
                <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="1" y="1" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-150 disabled:opacity-25 hover:brightness-110 active:scale-95 shrink-0"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Reset link */}
        {hasMessages && (
          <div className="flex justify-end mt-1">
            <button
              onClick={onReset}
              className="text-[9px] transition-colors hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              Reset chat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
