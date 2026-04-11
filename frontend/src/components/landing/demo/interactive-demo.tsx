"use client"

import { useRef, useState, useEffect } from "react"
import { DemoShell } from "./demo-shell"
import { DemoTranscript } from "./demo-transcript"
import { DemoChat } from "./demo-chat"
import { DemoInput } from "./demo-input"
import { useDemoScript } from "./use-demo-script"

export function InteractiveDemo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)

    // Fallback: start after 2s regardless (handles edge cases where
    // the element is in viewport but IntersectionObserver doesn't fire)
    const fallback = setTimeout(() => setIsVisible(true), 2000)

    return () => {
      observer.disconnect()
      clearTimeout(fallback)
    }
  }, [])

  const demo = useDemoScript(isVisible)

  return (
    <div ref={containerRef} className="relative mx-auto max-w-md sm:max-w-lg">
      {/* Glow effect */}
      <div className="absolute -inset-6 rounded-3xl blur-2xl bg-purple-500/20 pointer-events-none" />

      <div className="demo-app relative rounded-2xl overflow-hidden shadow-[0_0_80px_-8px_rgba(168,85,247,0.35)]">
        <DemoShell meetingDuration={demo.formattedTimer}>
          <DemoTranscript
            entries={demo.transcriptEntries}
            isActive={true}
          />

          <div
            className="mx-4 border-t"
            style={{ borderColor: "var(--border)" }}
          />

          <DemoChat
            messages={demo.chatMessages}
            isStreaming={demo.isStreaming}
          />

          <DemoInput
            onSend={demo.handleUserMessage}
            onChipAction={demo.handleChipAction}
            disabled={demo.inputDisabled}
            isLoading={demo.isStreaming}
          />
        </DemoShell>
      </div>
    </div>
  )
}
