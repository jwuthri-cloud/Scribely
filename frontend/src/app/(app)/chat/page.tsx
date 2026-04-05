"use client"

import React, { useState, useRef, useEffect } from "react"
import { Bot, User } from "lucide-react"
import { BoltStyleChat, ChatInput, RayBackground } from "@/components/ui/bolt-style-chat"
import { ChatMarkdown } from "@/components/app/chat/ChatMarkdown"
import { LoadingDots } from "@/components/app/workspace/LoadingDots"
import { useApi } from "@/hooks/useApi"
import { cn } from "@/lib/utils"
import { fetchChatModels, type ChatModelOption } from "@/lib/api"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export default function ChatPage() {
  const api = useApi()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchChatModels()
      .then((res) => {
        if (cancelled) return
        setChatModels(res.models)
        setSelectedModelId((prev) => prev || res.default_model)
      })
      .catch(() => {
        if (cancelled) return
        setChatModels([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isStreaming])

  const handleSend = async (message: string, options?: { model?: string }) => {
    if (!message.trim() || isStreaming) return

    const model =
      options?.model ||
      selectedModelId ||
      chatModels[0]?.id ||
      undefined
    if (!model) {
      const uid = crypto.randomUUID()
      const errId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        { id: uid, role: "user", content: message.trim() },
        {
          id: errId,
          role: "assistant",
          content:
            "Could not load models. Check that the API is running (NEXT_PUBLIC_API_URL) and try again.",
        },
      ])
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message.trim(),
    }

    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setIsStreaming(true)

    try {
      await api.chatStream(message.trim(), (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        )
      }, { model })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get response"
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `Error: ${msg}` }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }

  if (messages.length === 0) {
    return (
      <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden sm:-mx-6 lg:-mx-8">
        <BoltStyleChat
          title="What will you"
          subtitle="Ask questions against your meeting transcripts, action items, and more."
          announcementText="AI-powered workspace chat"
          placeholder="Ask anything about your meetings…"
          className="!min-h-0 !h-full"
          onSend={handleSend}
          chatModels={chatModels}
          selectedModelId={selectedModelId}
          onModelChange={setSelectedModelId}
        />
      </div>
    )
  }

  return (
    <div className="relative -mx-4 flex min-h-0 flex-1 flex-col overflow-hidden sm:-mx-6 lg:-mx-8">
      <RayBackground />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/60 px-5 py-3.5 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
              <Bot className="h-4 w-4 text-cyan-200" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Workspace chat</p>
              <p className="text-[11px] text-white/40">
                {messages.filter((m) => m.role === "user").length} messages
              </p>
            </div>
          </div>
          {isStreaming && (
            <div className="flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-100">
              <LoadingDots dotClassName="h-1.5 w-1.5 bg-cyan-200" />
              Responding
            </div>
          )}
        </div>

        {/* Messages thread — scrolls inside viewport; composer stays anchored */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
        >
          <div className="mx-auto flex max-w-[680px] flex-col gap-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-end gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                    <Bot className="h-3.5 w-3.5 text-cyan-200" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-[14px] leading-7",
                    msg.role === "user"
                      ? "rounded-br-md bg-[#1488fc] text-white shadow-[0_0_20px_rgba(20,136,252,0.15)]"
                      : "rounded-bl-md border border-white/[0.08] bg-white/[0.04] text-white/90"
                  )}
                >
                  {msg.content ? (
                    <ChatMarkdown content={msg.content} variant={msg.role} />
                  ) : (
                    <div className="flex items-center gap-2 text-white/50">
                      <LoadingDots dotClassName="h-1.5 w-1.5 bg-white/50" />
                      <span className="text-sm">Thinking</span>
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                    <User className="h-3.5 w-3.5 text-blue-200" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.06] bg-black/60 px-4 py-4 backdrop-blur-xl sm:px-6">
          <ChatInput
            placeholder="Ask a follow-up question…"
            onSend={handleSend}
            disabled={isStreaming}
            models={chatModels}
            selectedModelId={selectedModelId}
            onModelChange={setSelectedModelId}
          />
        </div>
      </div>
    </div>
  )
}
