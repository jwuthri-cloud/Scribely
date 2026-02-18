import { useState, useEffect, useCallback } from 'react'
import type { Insight, InsightAction, WebSearchResult } from '../types/insights'

const MAX_INSIGHTS = 50
const INSIGHT_TTL_MS = 5 * 60 * 1000 // 5 minutes — remove insights after this

interface InsightWithResult extends Insight {
  searchResult?: WebSearchResult | null
  searchLoading?: boolean
  receivedAt: number
}

function filterExpired<T extends { receivedAt?: number }>(items: T[], ttlMs: number): T[] {
  const now = Date.now()
  return items.filter((i) => {
    if (i.receivedAt == null) return true // legacy: keep if no timestamp
    return now - i.receivedAt < ttlMs
  })
}

export function useLiveInsights(options?: {
  onSendToChat?: (text: string) => void
}) {
  const [insights, setInsights] = useState<InsightWithResult[]>([])
  const { onSendToChat } = options ?? {}

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onInsightNew) return

    const unsubNew = api.onInsightNew((insight: Insight) => {
      setInsights((prev) => {
        const withReceived = { ...insight, receivedAt: Date.now() } as InsightWithResult
        const next = [withReceived, ...prev]
        return filterExpired(next, INSIGHT_TTL_MS).slice(0, MAX_INSIGHTS)
      })
    })

    const unsubUpdate = api.onInsightUpdate?.((update: { id: string; title?: string; description?: string; suggestedActions?: import('../types/insights').InsightAction[] }) => {
      setInsights((prev) =>
        prev.map((i) =>
          i.id === update.id
            ? {
                ...i,
                ...(update.title != null && { title: update.title }),
                ...(update.description != null && { description: update.description }),
                ...(update.suggestedActions != null && { suggestedActions: update.suggestedActions }),
                enriched: true,
              }
            : i,
        ),
      )
    })

    return () => {
      unsubNew()
      unsubUpdate?.()
    }
  }, [])

  // Remove expired insights every minute
  useEffect(() => {
    const id = setInterval(() => {
      setInsights((prev) => {
        const filtered = filterExpired(prev, INSIGHT_TTL_MS)
        return filtered.length === prev.length ? prev : filtered
      })
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const runSearch = useCallback(
    async (insightId: string, query: string) => {
      const api = window.electronAPI
      if (!api?.llmWebSearch || !query.trim()) return

      setInsights((prev) =>
        prev.map((i) =>
          i.id === insightId ? { ...i, searchLoading: true, searchResult: null } : i,
        ),
      )
      try {
        const result = await api.llmWebSearch(query.trim())
        setInsights((prev) =>
          prev.map((i) =>
            i.id === insightId
              ? { ...i, searchLoading: false, searchResult: result as WebSearchResult }
              : i,
          ),
        )
      } catch (err) {
        setInsights((prev) =>
          prev.map((i) =>
            i.id === insightId
              ? {
                  ...i,
                  searchLoading: false,
                  searchResult: {
                    content: '',
                    error: err instanceof Error ? err.message : 'Search failed',
                  },
                }
              : i,
          ),
        )
      }
    },
    [],
  )

  const executeAction = useCallback(
    async (insightId: string, action: InsightAction) => {
      const api = window.electronAPI
      if (!api) return

      if (action.type === 'search') {
        await runSearch(insightId, action.payload)
      } else if (
        (action.type === 'answer' ||
          action.type === 'follow_up' ||
          action.type === 'summarize') &&
        onSendToChat
      ) {
        onSendToChat(action.payload)
      }
    },
    [onSendToChat, runSearch],
  )

  /** Search the web with a custom follow-up query. Prepends insight context (e.g. entity name) when useful. */
  const searchWithQuery = useCallback(
    (insightId: string, customQuery: string) => {
      if (!customQuery.trim()) return
      const insight = insights.find((i) => i.id === insightId)
      if (!insight) return

      const context =
        insight.type === 'key_mention'
          ? insight.description
          : insight.questionWithContext || insight.description
      const query = context ? `${context} ${customQuery}`.trim() : customQuery.trim()
      runSearch(insightId, query)
    },
    [insights, runSearch],
  )

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setInsights([])
  }, [])

  return {
    insights,
    executeAction,
    searchWithQuery,
    dismissInsight,
    clearAll,
  }
}
