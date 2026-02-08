'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useUser, useAuth, SignInButton } from '@clerk/nextjs'
import { Terminal, Send, Loader2 } from 'lucide-react'
import { createApiClient, ChatResponse } from '@/lib/api'
import { toast } from 'react-hot-toast'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function TerminalPage() {
  const { isSignedIn, user } = useUser()
  const { getToken } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Focus input when authenticated
    if (isSignedIn && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isSignedIn])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !isSignedIn) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Get Clerk token
      const token = await getToken()
      const apiClient = createApiClient(token)

      // Send chat request
      const response: ChatResponse = await apiClient.chat(userMessage.content)

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error('Chat error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Terminal className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-blue-500 bg-clip-text text-transparent mb-4">
            Terminal Chat
          </h1>
          <p className="text-white/70 mb-8 max-w-md mx-auto">
            Sign in with Google to start chatting with AI
          </p>
          <SignInButton mode="modal">
            <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-semibold transition-all">
              Sign in with Google
            </button>
          </SignInButton>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col font-mono">
      {/* Header */}
      <header className="border-b border-gray-800/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-purple-400" />
            <span className="text-white font-semibold">Terminal Chat</span>
          </div>
          <span className="text-white/40 text-sm">|</span>
          <span className="text-white/60 text-sm">
            {user?.primaryEmailAddress?.emailAddress}
          </span>
        </div>
        <div className="text-white/40 text-xs">
          Model: openai/gpt-4o-mini
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="text-white/40 mb-4">
                <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">Type a message to start chatting...</p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                    : 'bg-gray-800/50 border border-gray-700/50 text-white/90'
                }`}
              >
                <div className="text-xs text-white/50 mb-1">
                  {message.role === 'user' ? '[You]' : '[AI]'}
                </div>
                <div className="whitespace-pre-wrap break-words">
                  {message.content}
                </div>
                <div className="text-xs text-white/30 mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-3">
                <div className="flex items-center space-x-2 text-white/60">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-800/50 px-6 py-4 bg-gray-900/30">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 text-sm">
                {'>'}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
                className="w-full pl-8 pr-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50 font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
          <div className="mt-2 text-xs text-white/30 text-center">
            Press Enter to send • No session storage - reload resets conversation
          </div>
        </div>
      </div>
    </div>
  )
}
