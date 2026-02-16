import { useState, useEffect, useCallback } from 'react'
import type { Insight, InsightAction, WebSearchResult } from '../types/insights'

const MAX_INSIGHTS = 50

interface InsightWithResult extends Insight {
  searchResult?: WebSearchResult | null
  searchLoading?: boolean
}

export function useLiveInsights(options?: {
  onSendToChat?: (text: string) => void
}) {
  const [insights, setInsights] = useState<InsightWithResult[]>([])
  const { onSendToChat } = options ?? {}

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onInsightNew) return

    const unsub = api.onInsightNew((insight: Insight) => {
      setInsights((prev) => {
        const next = [insight as InsightWithResult, ...prev]
        return next.slice(0, MAX_INSIGHTS)
      })
    })
    return () => unsub()
  }, [])

  const executeAction = useCallback(
    async (insightId: string, action: InsightAction) => {
      const api = window.electronAPI
      if (!api) return

      if (action.type === 'search' && api.llmWebSearch) {
        setInsights((prev) =>
          prev.map((i) =>
            i.id === insightId
              ? { ...i, searchLoading: true, searchResult: null }
              : i,
          ),
        )
        try {
          const result = await api.llmWebSearch(action.payload)
          setInsights((prev) =>
            prev.map((i) =>
              i.id === insightId
                ? {
                    ...i,
                    searchLoading: false,
                    searchResult: result as WebSearchResult,
                  }
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
      } else if (
        (action.type === 'answer' ||
          action.type === 'follow_up' ||
          action.type === 'summarize') &&
        onSendToChat
      ) {
        onSendToChat(action.payload)
      }
    },
    [onSendToChat],
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
    dismissInsight,
    clearAll,
  }
}
