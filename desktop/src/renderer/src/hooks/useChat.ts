import { useState, useCallback, useEffect } from 'react'
import type { ChatMessage, ChatAttachment } from '../types'

/**
 * Chat hook with IPC communication, reset, stop, and attachment support.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Listen for responses from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onMessage((response: string) => {
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsLoading(false)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  // Listen for reset-chat IPC (from hotkey)
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onResetChat(() => {
      setMessages([])
      setIsLoading(false)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  const sendMessage = useCallback(
    (content: string, attachments?: ChatAttachment[]) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments,
      }

      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)

      if (window.electronAPI?.sendMessage) {
        window.electronAPI.sendMessage(content)
      } else {
        // Fallback for browser-only dev
        setTimeout(() => {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `You said: "${content}"\n\n(Placeholder — backend integration coming soon.)`,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, assistantMsg])
          setIsLoading(false)
        }, 600)
      }
    },
    [],
  )

  const resetChat = useCallback(() => {
    setMessages([])
    setIsLoading(false)
  }, [])

  const stopGeneration = useCallback(() => {
    if (!isLoading) return
    setIsLoading(false)
    window.electronAPI?.cancelResponse()
  }, [isLoading])

  return { messages, isLoading, sendMessage, resetChat, stopGeneration }
}
