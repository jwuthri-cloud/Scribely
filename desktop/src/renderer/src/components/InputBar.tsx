import { useState, useRef, useEffect, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MicWaveform } from './MicWaveform'
import type { ChatAttachment } from '../types'
import { type ModelId, MODEL_CONFIGS } from '../types/settings'

/** Wraps content and shows tooltip on hover (z-[9999] so it appears above overlay) */
function WithTooltip({
  tooltip,
  children,
}: {
  tooltip: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none z-[9999]"
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
    </div>
  )
}

/** Icon button with custom tooltip (z-50) so it appears above overlay */
function IconBtnWithTooltip({
  tooltip,
  onClick,
  active,
  color,
  children,
  ...rest
}: {
  tooltip: string
  onClick: () => void
  active?: boolean
  color?: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 hover:bg-[var(--surface-hover)]"
        style={{
          color: color ?? (active ? 'var(--accent)' : 'var(--text-muted)'),
        }}
        onClick={onClick}
        aria-label={tooltip}
        {...rest}
      >
        {children}
      </button>
      {hovered && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none z-[9999]"
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
    </div>
  )
}

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'gpt5-nano', label: 'Nano' },
  { id: 'gpt5-mini', label: 'Mini' },
  { id: 'gpt-5.2', label: '5.2' },
]

const SUMMARIZE_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16M4 12h10M4 18h14" />
  </svg>
)

const VIEW_SUMMARY_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </svg>
)

interface InputBarProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void
  /** Run web search with current input (shows result + sources in chat) */
  onWebSearch?: (query: string) => void
  disabled?: boolean
  isLoading?: boolean
  onStop?: () => void
  onScreenshot?: () => void
  pendingScreenshot?: string | null
  onClearScreenshot?: () => void
  isRecording?: boolean
  onToggleRecording?: () => void
  sttTranscript?: string
  onClearTranscript?: () => void
  micLevel?: number
  modelDownloading?: boolean
  modelProgress?: number
  currentModel?: ModelId
  onModelChange?: (modelId: ModelId) => void
  /** When provided, shows a small Summarize button at bottom right */
  onSummarizeTranscript?: () => Promise<void>
  summarizeInProgress?: boolean
  /** When true, shows a small View summary button at bottom right */
  hasSummary?: boolean
  onViewSummary?: () => void
  /** When provided with hasMessages, shows Reset chat link */
  onReset?: () => void
  hasMessages?: boolean
  /** Context usage for token display (promptTokens, contextWindow) */
  contextUsage?: { promptTokens: number; contextWindow: number } | null
}

export function InputBar({
  onSend,
  onWebSearch,
  disabled,
  isLoading,
  onStop,
  onScreenshot,
  pendingScreenshot,
  onClearScreenshot,
  isRecording,
  onToggleRecording,
  sttTranscript,
  onClearTranscript,
  micLevel = 0,
  modelDownloading,
  modelProgress = 0,
  currentModel = 'gpt-5.2',
  onModelChange,
  onSummarizeTranscript,
  summarizeInProgress = false,
  hasSummary = false,
  onViewSummary,
  onReset,
  hasMessages = false,
  contextUsage,
}: InputBarProps) {
  const [value, setValue] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close model picker when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (showModelPicker && pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModelPicker])

  // Focus input when Option+Enter hotkey is pressed
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFocusChatInput?.(() => {
      inputRef.current?.focus()
    })
    return () => unsubscribe?.()
  }, [])

  // Append STT transcript to input value
  useEffect(() => {
    if (sttTranscript) {
      setValue((prev) => (prev ? `${prev} ${sttTranscript}` : sttTranscript))
      onClearTranscript?.()
    }
  }, [sttTranscript, onClearTranscript])

  // Auto-resize textarea as user types
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '24px'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [value])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return

    const attachments: ChatAttachment[] = []
    if (pendingScreenshot) {
      attachments.push({ type: 'image', data: pendingScreenshot, label: 'Screenshot' })
    }

    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setValue('')
    setJustSent(true)
    setTimeout(() => setJustSent(false), 1500)
    inputRef.current?.focus()
  }

  return (
    <div className="px-4 pb-4 pt-2 shrink-0 space-y-2">
      {/* Context utilization indicator */}
      {contextUsage && contextUsage.contextWindow > 0 && (
        <div
          className="px-2 py-1 rounded-lg flex items-center justify-between"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--surface) 80%, transparent)',
            border: '1px solid var(--border)',
          }}
        >
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            Context
          </span>
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 rounded-full overflow-hidden flex-1 min-w-[60px] max-w-[100px]"
              style={{ backgroundColor: 'var(--border)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    (contextUsage.promptTokens / contextUsage.contextWindow) * 100,
                  )}%`,
                  backgroundColor:
                    contextUsage.promptTokens / contextUsage.contextWindow > 0.8
                      ? 'var(--error)'
                      : 'var(--accent)',
                }}
              />
            </div>
            <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {(contextUsage.promptTokens / 1000).toFixed(1)}k /{' '}
              {(contextUsage.contextWindow / 1000).toFixed(0)}k
            </span>
          </div>
        </div>
      )}

      {/* Screenshot preview */}
      {pendingScreenshot && (
        <div className="relative inline-block">
          <img
            src={pendingScreenshot}
            alt="Screenshot preview"
            className="h-16 rounded-lg border object-cover"
            style={{ borderColor: 'var(--border)' }}
          />
          <button
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
            style={{
              backgroundColor: 'var(--error)',
              color: '#fff',
            }}
            onClick={onClearScreenshot}
            aria-label="Remove screenshot"
          >
            x
          </button>
        </div>
      )}

      {/* Recording indicator + waveform */}
      {isRecording && (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: modelDownloading
              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
              : 'rgba(224, 108, 117, 0.1)',
          }}
        >
          <div
            className="flex items-center gap-2 text-xs px-2 py-1.5"
            style={{
              color: modelDownloading ? 'var(--accent)' : 'var(--error)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0 animate-pulse"
              style={{
                backgroundColor: modelDownloading ? 'var(--accent)' : 'var(--error)',
              }}
            />
            <span className="flex-1">
              {modelDownloading
                ? `Downloading transcription model... ${modelProgress}%`
                : 'Recording... press mic or hotkey to stop'}
            </span>
            {modelDownloading && (
              <div
                className="w-16 h-1 rounded-full overflow-hidden shrink-0"
                style={{ backgroundColor: 'var(--border)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: 'var(--accent)',
                    width: `${modelProgress}%`,
                  }}
                />
              </div>
            )}
          </div>
          {!modelDownloading && (
            <div className="px-2 pb-1.5">
              <MicWaveform level={micLevel} isActive={isRecording} height={28} />
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          className="flex items-center gap-1 rounded-xl px-3 py-2 border transition-all duration-150 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_1px_var(--accent)] min-w-0"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--input-border)',
          }}
        >
          {/* Toolbar buttons */}
          <div className="flex items-center gap-0.5 mr-2">
            <IconBtnWithTooltip
              tooltip="Screenshot (⌥S)"
              onClick={onScreenshot ?? (() => {})}
              active={!!pendingScreenshot}
              color={pendingScreenshot ? 'var(--accent)' : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3 8h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </IconBtnWithTooltip>
            <IconBtnWithTooltip
              tooltip="Toggle recording (⌥A)"
              onClick={onToggleRecording ?? (() => {})}
              color={isRecording ? 'var(--error)' : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M12 19v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </IconBtnWithTooltip>
            {onWebSearch && (
              <IconBtnWithTooltip
                tooltip={value.trim() ? `Search: "${value.trim().slice(0, 30)}${value.trim().length > 30 ? '...' : ''}"` : 'Search the web (type a query first)'}
                onClick={() => {
                  const q = value.trim()
                  if (q && !disabled) {
                    onWebSearch(q)
                    setValue('')
                  }
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  style={{ opacity: !value.trim() || disabled ? 0.5 : 1 }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </IconBtnWithTooltip>
            )}
          </div>

          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as FormEvent)
              }
              // Shift+Enter: default behavior inserts newline
            }}
            placeholder="Ask anything..."
            disabled={disabled}
            rows={1}
            className="flex-1 min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 text-[13px] resize-none py-1"
            style={{
              color: 'var(--text)',
              caretColor: 'var(--accent)',
              minHeight: '24px',
              maxHeight: '120px',
            }}
            autoFocus
          />

          {/* Model selector */}
          <div className="relative flex items-center shrink-0 min-w-[2.5rem]" ref={pickerRef}>
            <WithTooltip tooltip="Switch model">
              <button
                type="button"
                onClick={() => setShowModelPicker((prev) => !prev)}
                className="w-full px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-all duration-150 border hover:brightness-110 max-w-[3.5rem] sm:max-w-none overflow-hidden"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'transparent',
                }}
              >
                <span className="block truncate">
                  {MODEL_CONFIGS[currentModel]?.label ?? currentModel}
                </span>
              </button>
            </WithTooltip>
            {showModelPicker && (
              <div
                className="absolute bottom-full mb-1 rounded-lg border py-1 shadow-lg z-[9999] max-h-48 overflow-y-auto overflow-x-hidden"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  right: 0,
                  minWidth: '10rem',
                  maxWidth: 'min(calc(100vw - 32px), 18rem)',
                }}
              >
                {MODEL_OPTIONS.map((opt) => {
                  const isActive = opt.id === currentModel
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        onModelChange?.(opt.id)
                        setShowModelPicker(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-[11px] transition-colors hover:bg-[var(--surface-hover)] flex items-center gap-3 shrink-0"
                      style={{
                        color: isActive ? 'var(--accent)' : 'var(--text)',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <span className="shrink-0 w-8">{opt.label}</span>
                      <span className="text-[9px] truncate min-w-0" style={{ color: 'var(--text-muted)' }}>
                        {MODEL_CONFIGS[opt.id]?.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Send or Stop button */}
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="ml-2 flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 hover:brightness-110 active:scale-95"
              style={{
                backgroundColor: 'var(--error)',
                color: '#fff',
              }}
              title="Stop generation"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <rect x="1" y="1" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || !value.trim()}
              className="ml-2 flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 disabled:opacity-25 hover:brightness-110 active:scale-95 min-w-[28px]"
              style={{
                backgroundColor: justSent ? 'var(--success)' : 'var(--accent)',
                color: '#fff',
              }}
            >
              <AnimatePresence mode="wait">
                {justSent ? (
                  <motion.span
                    key="sent"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="flex items-center justify-center"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </motion.span>
                ) : (
                  <motion.span
                    key="send"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5" />
                      <path d="M5 12l7-7 7 7" />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}
        </div>
      </form>
      <div className="flex items-center justify-between mt-1 px-1">
        <div className="flex items-center gap-2">
          <p
            className="text-[9px]"
            style={{ color: 'var(--text-muted)' }}
          >
            Enter to send · Shift+Enter for new line · ⌥↵ to focus
          </p>
          {hasMessages && onReset && (
            <button
              onClick={onReset}
              className="text-[9px] transition-colors hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              Reset chat
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasSummary && onViewSummary && (
            <WithTooltip tooltip="View transcript summary">
              <button
                type="button"
                onClick={onViewSummary}
                className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  color: 'var(--accent)',
                  border: '1px dashed var(--accent)',
                }}
                aria-label="View summary"
              >
                {VIEW_SUMMARY_ICON}
              </button>
            </WithTooltip>
          )}
          {onSummarizeTranscript && (
            <WithTooltip tooltip="Summarize transcript — Compresses long meeting transcripts into a concise summary to save context space">
              <button
                type="button"
                onClick={onSummarizeTranscript}
                disabled={summarizeInProgress}
                className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--chip-bg)',
                  color: 'var(--chip-text)',
                  border: '1px solid var(--border)',
                }}
                aria-label="Summarize transcript"
              >
                {summarizeInProgress ? (
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  SUMMARIZE_ICON
                )}
              </button>
            </WithTooltip>
          )}
        </div>
      </div>
    </div>
  )
}
