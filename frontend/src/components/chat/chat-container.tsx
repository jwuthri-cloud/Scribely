'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, Terminal, Settings, History } from 'lucide-react'
import { useChat } from '@/hooks/use-chat'
import { MessageItem } from './message-item'
import Link from 'next/link'

export function ChatContainer() {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, sendMessage } = useChat()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    try {
      await sendMessage(userMessage)
    } catch (error) {
      console.error('Failed to send message:', error)
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

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800/50">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-white font-bold tracking-wider hover:text-purple-400 transition-colors">
            AI Agent App
          </Link>
          <div className="flex items-center space-x-2 text-sm text-white/60">
            <Terminal className="w-4 h-4" />
            <span>AI Chat</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button className="p-2 text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/10">
            <History className="w-5 h-5" />
          </button>
          <button className="p-2 text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/10">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Welcome Message */}
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12"
              >
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Welcome!
                </h2>
                <p className="text-white/70 mb-8 max-w-md mx-auto">
                  Start a conversation with AI. Ask questions, get help, or just chat about anything.
                </p>

                {/* Example prompts */}
                <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setInput("Explain quantum computing in simple terms")}
                    className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg text-left hover:border-purple-500/50 transition-all group"
                  >
                    <div className="text-white font-medium mb-2">🔬 Learn Something</div>
                    <div className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                      Explain quantum computing in simple terms
                    </div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setInput("Help me write a professional email")}
                    className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg text-left hover:border-blue-500/50 transition-all group"
                  >
                    <div className="text-white font-medium mb-2">✍️ Get Help</div>
                    <div className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                      Help me write a professional email
                    </div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setInput("What are the latest trends in web development?")}
                    className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg text-left hover:border-green-500/50 transition-all group"
                  >
                    <div className="text-white font-medium mb-2">📈 Stay Updated</div>
                    <div className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                      What are the latest trends in web development?
                    </div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setInput("Give me a creative writing prompt")}
                    className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg text-left hover:border-yellow-500/50 transition-all group"
                  >
                    <div className="text-white font-medium mb-2">🎨 Be Creative</div>
                    <div className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                      Give me a creative writing prompt
                    </div>
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Messages */}
            <AnimatePresence>
              {messages.map((message: any) => (
                <MessageItem
                  key={message.id}
                  message={message}
                />
              ))}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center space-x-3"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="text-white/60">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-800/50 p-6">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message... (e.g., 'How does machine learning work?')"
                    disabled={isLoading}
                    className="w-full px-4 py-4 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50 pr-12"
                  />
                  {input && (
                    <button
                      type="button"
                      onClick={() => setInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl transition-all duration-200 disabled:scale-100 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Hint */}
              <div className="mt-2 text-xs text-white/40 flex items-center justify-between">
                <span>Press Enter to send, Shift+Enter for new line</span>
                <span>{input.length}/500</span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
