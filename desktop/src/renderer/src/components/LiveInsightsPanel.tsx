import { useState, useRef, useEffect, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Insight, InsightAction, WebSearchResult } from '../types/insights'
import { getQuickActionIcon } from './QuickActionIcons'
import { MarkdownContent } from './MarkdownContent'

function getInsightTypeIcon(type: Insight['type']) {
  switch (type) {
    case 'question':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    case 'decision':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
        </svg>
      )
  }
}

function getActionIcon(icon: string) {
  const map: Record<string, React.ReactNode> = {
    search: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    chat: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    document: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
    sparkle: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      </svg>
    ),
  }
  return map[icon] ?? getQuickActionIcon(icon, '')
}

interface LiveInsightsPanelProps {
  insights: Array<Insight & { searchResult?: WebSearchResult | null; searchLoading?: boolean }>
  onExecuteAction: (insightId: string, action: InsightAction) => void
  onSearchWithQuery?: (insightId: string, query: string) => void
  onDismissInsight?: (id: string) => void
  onClearAll?: () => void
  onSendToChat?: (text: string) => void
}

export function LiveInsightsPanel({
  insights,
  onExecuteAction,
  onSearchWithQuery,
  onDismissInsight,
  onClearAll,
  onSendToChat,
}: LiveInsightsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [insights, expanded])

  if (insights.length === 0) return null

  return (
    <div
      className="mx-3 mb-2 rounded-xl overflow-hidden shrink-0"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
        />
        <span
          className="text-[11px] font-medium"
          style={{ color: 'var(--text)' }}
        >
          {expanded ? 'Live insights' : `${insights.length} insight${insights.length !== 1 ? 's' : ''}`}
        </span>
        {onClearAll && insights.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClearAll()
            }}
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            Clear
          </button>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="shrink-0 transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
          }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="max-h-[220px] overflow-y-auto px-3 pb-2 space-y-2"
            >
              {insights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onExecuteAction={onExecuteAction}
                  onSearchWithQuery={onSearchWithQuery}
                  onDismiss={onDismissInsight}
                  onSendToChat={onSendToChat}
                  getTypeIcon={getInsightTypeIcon}
                  getActionIcon={getActionIcon}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface InsightCardProps {
  insight: Insight & { searchResult?: WebSearchResult | null; searchLoading?: boolean }
  onExecuteAction: (insightId: string, action: InsightAction) => void
  onSearchWithQuery?: (insightId: string, query: string) => void
  onDismiss?: (id: string) => void
  onSendToChat?: (text: string) => void
  getTypeIcon: (type: Insight['type']) => React.ReactNode
  getActionIcon: (icon: string) => React.ReactNode
}

function InsightCard({
  insight,
  onExecuteAction,
  onSearchWithQuery,
  onDismiss,
  onSendToChat,
  getTypeIcon,
  getActionIcon,
}: InsightCardProps) {
  const [followUp, setFollowUp] = useState('')
  const hasSearchResult = insight.searchResult && (insight.searchResult.content || insight.searchResult.error)
  const isLoading = insight.searchLoading
  const hasSearchAction = insight.suggestedActions.some((a) => a.type === 'search')

  const handleSubmit = (e: FormEvent) => {
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
      className="rounded-lg px-2.5 py-2 space-y-1.5"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
      }}
    >
      <div className="flex items-start gap-2">
        <span style={{ color: 'var(--accent)', marginTop: 2 }}>{getTypeIcon(insight.type)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium" style={{ color: 'var(--text)' }}>
            {insight.title}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {insight.description}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(insight.id)}
            className="p-0.5 rounded hover:bg-[var(--surface-hover)] shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Dismiss"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 pt-1">
        {insight.suggestedActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onExecuteAction(insight.id, action)}
            disabled={isLoading}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          >
            <span style={{ opacity: 0.8 }}>{getActionIcon(action.icon)}</span>
            {action.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center gap-1.5 py-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
          Searching...
        </div>
      )}

      {hasSearchResult && insight.searchResult && (
        <div
          className="mt-2 pt-2 rounded px-2 py-1.5 text-[10px] border-t"
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
                <MarkdownContent
                  content={insight.searchResult.content}
                  color="var(--text)"
                />
              </div>
              {insight.searchResult.sources && insight.searchResult.sources.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {insight.searchResult.sources.slice(0, 3).map((s, i) => (
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

      {hasSearchAction && onSearchWithQuery && (
        <form
          onSubmit={handleSubmit}
          className="mt-2 pt-2 flex gap-1 items-center border-t"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
        >
          <input
            type="text"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Ask a follow-up or search again..."
            disabled={isLoading}
            className="flex-1 min-w-0 px-1.5 py-1 rounded text-[10px] border bg-transparent focus:outline-none focus:ring-1"
            style={{
              color: 'var(--text)',
              borderColor: 'var(--border)',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !followUp.trim()}
            className="p-1 rounded hover:bg-[var(--surface-hover)] disabled:opacity-50 shrink-0"
            style={{ color: 'var(--accent)' }}
            title="Search the web"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          {onSendToChat && (
            <button
              type="button"
              onClick={handleSendToChat}
              disabled={isLoading || !followUp.trim()}
              className="p-1 rounded hover:bg-[var(--surface-hover)] disabled:opacity-50 shrink-0"
              style={{ color: 'var(--text-muted)' }}
              title="Send to chat"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
        </form>
      )}
    </div>
  )
}
