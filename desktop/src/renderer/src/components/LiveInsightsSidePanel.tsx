import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveInsights } from '../hooks/useLiveInsights'
import type { Insight, InsightAction, WebSearchResult } from '../types/insights'
import type { TranscriptEntry } from '../types/transcript'
import { getQuickActionIcon } from './QuickActionIcons'
import { MarkdownContent } from './MarkdownContent'

function getInsightTypeIcon(type: Insight['type']) {
  switch (type) {
    case 'question':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    case 'topic_change':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      )
    case 'action_item':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    case 'key_mention':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      )
    case 'decision':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
        </svg>
      )
  }
}

function getActionIcon(icon: string) {
  const map: Record<string, React.ReactNode> = {
    search: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    chat: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    document: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
    sparkle: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      </svg>
    ),
  }
  return map[icon] ?? getQuickActionIcon(icon, '')
}

interface FollowUpResult {
  content: string
  error?: string
}

interface InsightCardProps {
  insight: Insight & {
    searchResult?: WebSearchResult | null
    searchLoading?: boolean
    followUpResult?: FollowUpResult | null
    followUpLoading?: boolean
  }
  onExecuteAction: (insightId: string, action: InsightAction) => void
  onSearchWithQuery?: (insightId: string, query: string) => void
  onDismiss?: (id: string) => void
  onSendToChat?: (text: string) => void
}

function InsightCard({
  insight,
  onExecuteAction,
  onSearchWithQuery,
  onDismiss,
  onSendToChat,
  getTypeIcon,
  getActionIcon,
}: InsightCardProps & {
  getTypeIcon: (type: Insight['type']) => React.ReactNode
  getActionIcon: (icon: string) => React.ReactNode
}) {
  const [followUp, setFollowUp] = useState('')
  const hasSearchResult = insight.searchResult && (insight.searchResult.content || insight.searchResult.error)
  const hasFollowUpResult = insight.followUpResult && (insight.followUpResult.content || insight.followUpResult.error)
  const isLoading = insight.searchLoading || insight.followUpLoading
  const hasSearchAction = insight.suggestedActions.some((a) => a.type === 'search')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!followUp.trim()) return
    if (onSearchWithQuery) {
      onSearchWithQuery(insight.id, followUp.trim())
      setFollowUp('')
    }
  }

  const handleSendToChat = () => {
    if (!followUp.trim() || !onSendToChat) return
    onSendToChat(followUp.trim())
    setFollowUp('')
  }

  return (
    <div
      className="rounded-xl px-3 py-3 space-y-2"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
      }}
    >
      <div className="flex items-start gap-2">
        <span style={{ color: 'var(--accent)', marginTop: 2 }}>{getTypeIcon(insight.type)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>
            {insight.title}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {insight.type === 'question' && insight.questionWithContext
              ? insight.questionWithContext
              : insight.description}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(insight.id)}
            className="p-1 rounded hover:bg-[var(--surface-hover)] shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {insight.suggestedActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onExecuteAction(insight.id, action)}
            disabled={isLoading}
            title={action.type === 'search' ? `Search: "${action.payload}"` : undefined}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span style={{ opacity: 0.8 }}>{getActionIcon(action.icon)}</span>
            {action.label}
          </button>
        ))}
      </div>

      {insight.searchLoading && (
        <div className="flex items-center gap-2 py-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
          Searching...
        </div>
      )}

      {insight.followUpLoading && (
        <div className="flex items-center gap-2 py-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
          Suggesting follow-up questions...
        </div>
      )}

      {hasSearchResult && insight.searchResult && (
        <div
          className="mt-2 pt-2 rounded-lg px-2.5 py-2 text-[11px] border-t"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)',
            color: 'var(--text)',
          }}
        >
          {insight.searchResult.error ? (
            <span style={{ color: 'var(--error)' }}>{insight.searchResult.error}</span>
          ) : (
            <>
              <div className="leading-relaxed">
                <MarkdownContent content={insight.searchResult.content} color="var(--text)" />
              </div>
              {insight.searchResult.sources && insight.searchResult.sources.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {insight.searchResult.sources.slice(0, 5).map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate hover:underline"
                      style={{ color: 'var(--accent)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.title}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {hasFollowUpResult && insight.followUpResult && (
        <div
          className="mt-2 pt-2 rounded-lg px-2.5 py-2 text-[11px] border-t"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)',
            color: 'var(--text)',
          }}
        >
          {insight.followUpResult.error ? (
            <span style={{ color: 'var(--error)' }}>{insight.followUpResult.error}</span>
          ) : (
            <div className="leading-relaxed">
              <MarkdownContent
                content={insight.followUpResult.content}
                color="var(--text)"
                onListItemClick={
                  onSendToChat
                    ? (text) => onSendToChat(text)
                    : undefined
                }
              />
            </div>
          )}
        </div>
      )}

      {hasSearchAction && onSearchWithQuery && (
        <form
          onSubmit={handleSubmit}
          className="mt-2 pt-2 flex gap-1.5 items-center border-t"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
        >
          <input
            type="text"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Ask a follow-up or search again..."
            disabled={isLoading}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-[11px] border bg-transparent focus:outline-none focus:ring-1"
            style={{
              color: 'var(--text)',
              borderColor: 'var(--border)',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !followUp.trim()}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] disabled:opacity-50 shrink-0"
            style={{ color: 'var(--accent)' }}
            title="Search the web"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          {onSendToChat && (
            <button
              type="button"
              onClick={handleSendToChat}
              disabled={isLoading || !followUp.trim()}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] disabled:opacity-50 shrink-0"
              style={{ color: 'var(--text-muted)' }}
              title="Send to chat"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
        </form>
      )}
    </div>
  )
}

export interface LiveInsightsSidePanelProps {
  onSendToChat: (text: string) => void
  onClose: () => void
  transcriptEntries?: TranscriptEntry[]
}

export function LiveInsightsSidePanel({ onSendToChat, onClose, transcriptEntries = [] }: LiveInsightsSidePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const liveInsights = useLiveInsights({ onSendToChat, transcriptEntries })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [liveInsights.insights])

  return (
    <div
      className="w-80 shrink-0 flex flex-col h-full border-l overflow-hidden"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
            Live insights
          </span>
          {liveInsights.insights.length > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                color: 'var(--accent)',
              }}
            >
              {liveInsights.insights.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {liveInsights.insights.length > 0 && (
            <button
              onClick={liveInsights.clearAll}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-muted)' }}
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {liveInsights.insights.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mb-3 opacity-50"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-xs">No insights yet</span>
            <span className="text-[10px] mt-1">Start a meeting to see live insights</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {liveInsights.insights.map((insight) => (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <InsightCard
                  insight={insight}
                  onExecuteAction={liveInsights.executeAction}
                  onSearchWithQuery={liveInsights.searchWithQuery}
                  onDismiss={liveInsights.dismissInsight}
                  onSendToChat={onSendToChat}
                  getTypeIcon={getInsightTypeIcon}
                  getActionIcon={getActionIcon}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
