import { useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage, ChatAttachment } from '../types'
import type { QuickAction } from '../types/settings'
import type { ModelId } from '../types/settings'
import { MarkdownContent } from './MarkdownContent'
import { CompactNavbar } from './CompactNavbar'
import { InputBar } from './InputBar'
import { ActionChips } from './ActionChips'

type ViewId = 'chat' | 'llm' | 'settings'

import appIconUrl from '../assets/app-icon.png'

interface CompactChatViewProps {
  messages: ChatMessage[]
  isLoading: boolean
  onSend: (content: string, attachments?: ChatAttachment[]) => void
  onWebSearch?: (query: string) => void
  onStop: () => void
  meetingActive: boolean
  meetingDuration: string
  onToggleMeeting: () => void
  onSetView: (view: ViewId) => void
  onReset: () => void
  quickActions?: QuickAction[]
  pendingScreenshot?: string | null
  onClearScreenshot?: () => void
  onScreenshot?: () => void
  isRecording?: boolean
  onToggleRecording?: () => void
  onToggleCompactMode?: () => void
  currentModel?: string
  onModelChange?: (modelId: string) => void
  modelOptions?: Array<{ id: string; label: string }>
  /** Footer props (shared with advanced mode) */
  sttTranscript?: string
  onClearTranscript?: () => void
  micLevel?: number
  modelDownloading?: boolean
  modelProgress?: number
  onSummarizeTranscript?: () => Promise<void>
  summarizeInProgress?: boolean
  hasSummary?: boolean
  onViewSummary?: () => void
  /** Summarize feedback toast (success/error) */
  summarizeFeedback?: { type: 'success' | 'error'; message?: string } | null
  onViewSummaryClick?: () => void
  insightsPanelExpanded?: boolean
  onToggleInsightsPanel?: () => void
  transcriptPanelExpanded?: boolean
  onToggleTranscriptPanel?: () => void
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
  onWebSearch,
  onStop,
  meetingActive,
  meetingDuration,
  onToggleMeeting,
  onSetView,
  onReset,
  quickActions,
  pendingScreenshot,
  onClearScreenshot,
  onScreenshot,
  isRecording = false,
  onToggleRecording,
  onToggleCompactMode,
  currentModel = 'gpt-5.2',
  onModelChange,
  modelOptions,
  sttTranscript,
  onClearTranscript,
  micLevel = 0,
  modelDownloading,
  modelProgress = 0,
  onSummarizeTranscript,
  summarizeInProgress = false,
  hasSummary = false,
  onViewSummary,
  summarizeFeedback,
  onViewSummaryClick,
  insightsPanelExpanded = false,
  onToggleInsightsPanel,
  transcriptPanelExpanded = false,
  onToggleTranscriptPanel,
}: CompactChatViewProps) {

  // Extract the last user message and last assistant message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')

  // Determine if the last assistant message is still streaming
  const lastMsg = messages[messages.length - 1]
  const isStreaming = isLoading && lastMsg?.role === 'assistant' && !lastMsg.isError

  const hasMessages = messages.length > 0

  const handleClose = useCallback(() => {
    if (window.electronAPI?.quit) {
      window.electronAPI.quit()
    } else {
      window.close()
    }
  }, [])

  const handleActionClick = useCallback(
    (actionValue: string) => {
      const attachments: ChatAttachment[] = []
      if (pendingScreenshot) {
        attachments.push({ type: 'image', data: pendingScreenshot, label: 'Screenshot' })
      }
      onSend(actionValue, attachments.length > 0 ? attachments : undefined)
    },
    [onSend, pendingScreenshot],
  )

  // Auto-scroll response area when streaming
  const responseRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [lastAssistantMsg?.content, isLoading])

  return (
    <div className="flex flex-col h-full">
      {/* ── Compact Navbar ── */}
      <CompactNavbar
        meetingActive={meetingActive}
        meetingDuration={meetingDuration}
        onToggleMeeting={onToggleMeeting}
        onSetView={onSetView}
        onClose={handleClose}
        onToggleCompactMode={onToggleCompactMode}
        insightsPanelExpanded={insightsPanelExpanded}
        onToggleInsightsPanel={onToggleInsightsPanel}
        transcriptPanelExpanded={transcriptPanelExpanded}
        onToggleTranscriptPanel={onToggleTranscriptPanel}
      />

      {/* ── Thin separator ── */}
      <div
        className="mx-4 h-px shrink-0"
        style={{ backgroundColor: 'var(--border)', opacity: 0.5 }}
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
              <img
                src={appIconUrl}
                alt=""
                className="w-8 h-8 object-contain rounded-lg"
                width={32}
                height={32}
              />
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
                className="flex flex-col items-end gap-1"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Image attachments from the last user message */}
                {lastUserMsg.attachments?.map((att, idx) => (
                  <div key={idx}>
                    {att.type === 'image' && (
                      <img
                        src={att.data}
                        alt={att.label || 'Attachment'}
                        className="rounded-lg max-h-24 object-cover border"
                        style={{ borderColor: 'var(--border)' }}
                      />
                    )}
                  </div>
                ))}
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
                      onListItemClick={
                        lastAssistantMsg.isFollowUp
                          ? (text) => onSend(text)
                          : undefined
                      }
                    />
                  </div>
                )}

                {/* Web Search badge + sources */}
                {lastAssistantMsg.isWebSearch && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
                      style={{
                        backgroundColor: 'color-mix(in srgb, #3b82f6 18%, transparent)',
                        color: '#60a5fa',
                      }}
                    >
                      Web Search
                    </span>
                    {lastAssistantMsg.webSources && lastAssistantMsg.webSources.length > 0 ? (
                      lastAssistantMsg.webSources.map((s, i) => (
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

      {/* Summarize feedback */}
      {summarizeFeedback && (
        <div
          className={`mx-4 mb-2 px-3 py-2 rounded-xl text-[11px] flex items-center gap-1.5 shrink-0 ${
            summarizeFeedback.type === 'success' ? 'cursor-pointer hover:brightness-110' : ''
          }`}
          style={{
            backgroundColor:
              summarizeFeedback.type === 'success'
                ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                : 'color-mix(in srgb, var(--error) 12%, transparent)',
            border: `1px solid color-mix(in srgb, var(--${summarizeFeedback.type}) 25%, transparent)`,
            color: summarizeFeedback.type === 'success' ? 'var(--success)' : 'var(--error)',
          }}
          onClick={summarizeFeedback.type === 'success' ? onViewSummaryClick : undefined}
        >
          {summarizeFeedback.type === 'success' ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Summary ready — click to view
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {summarizeFeedback.message}
            </>
          )}
        </div>
      )}

      {/* ── Shared footer (same as advanced mode): ActionChips + InputBar ── */}
      <ActionChips
        onAction={handleActionClick}
        customActions={quickActions?.length ? quickActions : undefined}
      />
      <InputBar
        onSend={onSend}
        onWebSearch={onWebSearch}
        modelOptions={modelOptions}
        disabled={isLoading}
        isLoading={isLoading}
        onStop={onStop}
        onScreenshot={onScreenshot}
        pendingScreenshot={pendingScreenshot}
        onClearScreenshot={onClearScreenshot}
        isRecording={isRecording}
        onToggleRecording={onToggleRecording}
        sttTranscript={sttTranscript}
        onClearTranscript={onClearTranscript}
        micLevel={micLevel}
        modelDownloading={modelDownloading}
        modelProgress={modelProgress}
        currentModel={currentModel}
        onModelChange={onModelChange}
        onSummarizeTranscript={onSummarizeTranscript}
        summarizeInProgress={summarizeInProgress}
        hasSummary={hasSummary}
        onViewSummary={onViewSummary}
        onReset={onReset}
        hasMessages={hasMessages}
      />
    </div>
  )
}
