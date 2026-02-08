import { useState, useCallback, useEffect } from 'react'
import type { ChatMessage } from '../types'

/**
 * Chat hook that communicates with the main process via IPC.
 * Falls back to a local echo if electronAPI is unavailable (e.g. in browser dev).
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

  const sendMessage = useCallback((content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    if (window.electronAPI?.sendMessage) {
      // Route through IPC to main process
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
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, isLoading, sendMessage, clearMessages }
}
