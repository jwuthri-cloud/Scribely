import { useState, useCallback, useEffect, useRef } from 'react'
import type { ChatMessage, ChatAttachment, TranscriptEntry, LLMChatDelta, LLMChatDone, LLMChatError } from '../types'

// ── Helpers ───────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

/**
 * Format transcript entries into the text block embedded in user messages.
 */
function formatTranscriptDelta(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => `[${formatTimestamp(e.startTime)}] ${e.speaker}: ${e.text}`)
    .join('\n')
}

/**
 * Build the full message content with transcript delta prepended.
 * Uses XML tags for modality: <transcript> for transcript, <user_query> for the question.
 * - First message in conversation: "MEETING TRANSCRIPT:" header
 * - Subsequent messages: "NEW TRANSCRIPT SINCE LAST MESSAGE:" header
 * - No transcript entries: just the raw question in <user_query>
 */
function buildMessageContent(
  rawQuery: string,
  delta: TranscriptEntry[],
  isFirstMessage: boolean,
): string {
  const queryBlock = `<user_query>\n${rawQuery}\n</user_query>`

  if (delta.length === 0) {
    return queryBlock
  }

  const header = isFirstMessage
    ? 'MEETING TRANSCRIPT:'
    : 'NEW TRANSCRIPT SINCE LAST MESSAGE:'
  const transcriptText = formatTranscriptDelta(delta)

  return `<transcript>\n${header}\n${transcriptText}\n</transcript>\n\n${queryBlock}`
}

// ── Hook ──────────────────────────────────────────────────

interface UseChatOptions {
  /** Live transcript entries from the meeting session */
  transcriptEntries?: TranscriptEntry[]
}

/**
 * Chat hook with streaming LLM integration, append-only transcript strategy,
 * and real-time streaming display.
 *
 * Each user message embeds only the NEW transcript entries since the last
 * message, producing a strictly append-only prefix ideal for prefix caching.
 */
export function useChat(options: UseChatOptions = {}) {
  const { transcriptEntries = [] } = options

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [contextUsage, setContextUsage] = useState<{
    promptTokens: number
    contextWindow: number
  } | null>(null)

  // Track the index of the last transcript entry that was included in a message.
  // Everything from this index onward is "new" and will be included as a delta
  // in the next user message.
  const lastTranscriptIndexRef = useRef(0)

  // Track the active request ID so we can match incoming stream events
  const activeRequestIdRef = useRef<string | null>(null)
  const activeWebSearchRequestIdRef = useRef<string | null>(null)

  // ── Streaming listeners (llm:chat-delta / done / error) ──
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const unsubDelta = api.onLLMChatDelta((data: LLMChatDelta) => {
      if (data.requestId !== activeRequestIdRef.current) return

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === data.requestId) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + data.delta },
          ]
        }
        return prev
      })
    })

    // Done: finalize the assistant message with usage and model info
    const unsubDone = api.onLLMChatDone((data: LLMChatDone) => {
      if (data.requestId !== activeRequestIdRef.current) return

      if (data.usage && data.contextWindow) {
        setContextUsage({
          promptTokens: data.usage.promptTokens,
          contextWindow: data.contextWindow,
        })
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === data.requestId) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: data.fullContent,
              model: data.model,
              usage: data.usage
                ? { ...data.usage, latencyMs: data.latencyMs }
                : data.usage,
            },
          ]
        }
        return prev
      })

      setIsLoading(false)
      activeRequestIdRef.current = null
    })

    // Error: show error or remove partial response
    const unsubError = api.onLLMChatError((data: LLMChatError) => {
      if (data.requestId !== activeRequestIdRef.current) return

      if (data.code === 'CANCELLED') {
        // On cancellation, keep any partial streaming content already accumulated
        // but stop loading. If no content was streamed yet, remove the placeholder.
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (
            last?.role === 'assistant' &&
            last.id === data.requestId &&
            !last.content
          ) {
            return prev.slice(0, -1)
          }
          return prev
        })
      } else {
        // For real errors, replace streaming message or add error message
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant' && last.id === data.requestId) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: data.error,
                isError: true,
                retryable: data.retryable,
              },
            ]
          }
          return [
            ...prev,
            {
              id: data.requestId,
              role: 'assistant' as const,
              content: data.error,
              timestamp: Date.now(),
              isError: true,
              retryable: data.retryable,
            },
          ]
        })
      }

      setIsLoading(false)
      activeRequestIdRef.current = null
    })

    return () => {
      unsubDelta?.()
      unsubDone?.()
      unsubError?.()
    }
  }, [])

  // ── Web search streaming listeners ──
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onLLMWebSearchDelta) return

    const unsubDelta = api.onLLMWebSearchDelta((data) => {
      if (data.requestId !== activeWebSearchRequestIdRef.current) return
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === data.requestId) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + data.delta },
          ]
        }
        return prev
      })
    })

    const unsubDone = api.onLLMWebSearchDone((data) => {
      if (data.requestId !== activeWebSearchRequestIdRef.current) return
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === data.requestId) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: data.content,
              isWebSearch: true,
              webSources: data.sources,
            },
          ]
        }
        return prev
      })
      setIsLoading(false)
      activeWebSearchRequestIdRef.current = null
    })

    const unsubError = api.onLLMWebSearchError((data) => {
      if (data.requestId !== activeWebSearchRequestIdRef.current) return
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === data.requestId) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: data.error, isError: true },
          ]
        }
        return prev
      })
      setIsLoading(false)
      activeWebSearchRequestIdRef.current = null
    })

    return () => {
      unsubDelta?.()
      unsubDone?.()
      unsubError?.()
    }
  }, [])

  // ── Listen for reset-chat IPC (from hotkey) ──
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onResetChat(() => {
      setMessages([])
      setIsLoading(false)
      setContextUsage(null)
      lastTranscriptIndexRef.current = 0
      activeRequestIdRef.current = null
      activeWebSearchRequestIdRef.current = null
      window.electronAPI?.llmReset()
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  // ── Send a message ──
  const sendMessage = useCallback(
    (content: string, attachments?: ChatAttachment[]) => {
      const api = window.electronAPI
      if (!api?.llmChat) {
        // Fallback for browser-only dev (no Electron)
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          rawQuery: content,
          timestamp: Date.now(),
          attachments,
        }
        setMessages((prev) => [...prev, userMsg])
        setIsLoading(true)
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `You said: "${content}"\n\n(Placeholder — LLM not connected.)`,
              timestamp: Date.now(),
            },
          ])
          setIsLoading(false)
        }, 600)
        return
      }

      // Compute transcript delta since last message
      const delta = transcriptEntries.slice(lastTranscriptIndexRef.current)
      lastTranscriptIndexRef.current = transcriptEntries.length

      // Determine if this is the first message (for header text)
      const isFirstMessage = messages.length === 0

      // Format the message content with embedded transcript delta
      const formattedContent = buildMessageContent(content, delta, isFirstMessage)

      // Generate request ID
      const requestId = crypto.randomUUID()
      activeRequestIdRef.current = requestId

      // Add user message + empty assistant placeholder immediately
      // so the response area and cursor appear right away (before first token)
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: formattedContent,
        rawQuery: content,
        timestamp: Date.now(),
        attachments,
      }
      const assistantPlaceholder: ChatMessage = {
        id: requestId, // same as delta requestId so we can match streaming updates
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
      setIsLoading(true)

      // Send to main process via IPC
      api.llmChat({
        requestId,
        message: formattedContent,
        rawQuery: content,
        transcriptDelta: delta.map((e) => ({
          id: e.id,
          speaker: e.speaker,
          text: e.text,
          startTime: e.startTime,
          endTime: e.endTime,
          source: e.source,
        })),
        attachments,
      })
    },
    [transcriptEntries, messages.length],
  )

  // ── Web search (streaming) ──
  const sendWebSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return

    const api = window.electronAPI
    if (!api?.llmWebSearchStream) return

    const requestId = crypto.randomUUID()
    activeWebSearchRequestIdRef.current = requestId

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      rawQuery: trimmed,
      timestamp: Date.now(),
    }
    const assistantPlaceholder: ChatMessage = {
      id: requestId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isWebSearch: true,
    }
    setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
    setIsLoading(true)

    api.llmWebSearchStream({ requestId, query: trimmed })
  }, [])

  // ── Reset chat ──
  const resetChat = useCallback(() => {
    setMessages([])
    setIsLoading(false)
    setContextUsage(null)
    lastTranscriptIndexRef.current = 0
    activeRequestIdRef.current = null
    activeWebSearchRequestIdRef.current = null
    window.electronAPI?.llmReset()
  }, [])

  // ── Stop generation ──
  const stopGeneration = useCallback(() => {
    if (!isLoading || !activeRequestIdRef.current) return
    window.electronAPI?.llmCancel(activeRequestIdRef.current)
    // Don't set isLoading to false here — the error callback will handle it
  }, [isLoading])

  return { messages, isLoading, sendMessage, sendWebSearch, resetChat, stopGeneration, contextUsage }
}
