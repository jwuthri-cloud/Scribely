"use client"

import { useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { DemoChatMessage } from "./demo-data"

interface DemoChatProps {
  messages: DemoChatMessage[]
  isStreaming: boolean
}

function renderInlineBold(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    if (line.startsWith("**") && line.endsWith("**") && !line.slice(2, -2).includes("**")) {
      elements.push(
        <p key={i} className="font-semibold mt-2 mb-1">
          {line.replace(/\*\*/g, "")}
        </p>
      )
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-1 my-0.5">
          <span style={{ color: "var(--text-muted)" }}>•</span>
          <span>{renderInlineBold(line.slice(2))}</span>
        </div>
      )
    } else if (line.match(/^\d+\.\s/)) {
      const numMatch = line.match(/^(\d+)\.\s(.*)$/)
      if (numMatch) {
        elements.push(
          <div key={i} className="flex gap-1.5 ml-1 my-0.5">
            <span style={{ color: "var(--text-muted)" }}>{numMatch[1]}.</span>
            <span>{renderInlineBold(numMatch[2]!)}</span>
          </div>
        )
      }
    } else if (line === "") {
      elements.push(<div key={i} className="h-1.5" />)
    } else {
      elements.push(
        <p key={i} className="my-0.5">
          {renderInlineBold(line)}
        </p>
      )
    }
  }

  return <>{elements}</>
}

export function DemoChat({ messages, isStreaming }: DemoChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  if (messages.length === 0) return null

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-2 space-y-3 demo-scrollbar"
    >
      <AnimatePresence>
        {messages.map((msg, i) => (
          <motion.div
            key={`${msg.role}-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {msg.role === "user" ? (
              <div
                className="rounded-xl px-3 py-2 text-[12px] leading-relaxed"
                style={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                {msg.content}
              </div>
            ) : (
              <div
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--text)" }}
              >
                <SimpleMarkdown content={msg.content} />
                {isStreaming && i === messages.length - 1 && (
                  <span
                    className="inline-block w-[6px] h-[14px] ml-0.5 rounded-sm animate-pulse"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                )}
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Cost/model info after completed assistant messages */}
      {messages.length > 0 &&
        messages[messages.length - 1]?.role === "assistant" &&
        !isStreaming && (
          <div
            className="flex items-center gap-2 text-[9px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span
              className="px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: "var(--chip-bg)",
                border: "1px solid var(--border)",
              }}
            >
              Nano
            </span>
            <span>3.3s</span>
            <span>~$0.0002</span>
            {/* Copy/regenerate icons */}
            <div className="flex items-center gap-1 ml-1">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ opacity: 0.5 }}
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ opacity: 0.5 }}
              >
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </div>
          </div>
        )}
    </div>
  )
}
