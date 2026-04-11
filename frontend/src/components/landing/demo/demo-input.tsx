"use client"

import { useState, useRef, useEffect, type FormEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { DEMO_QUICK_ACTIONS } from "./demo-data"

const QUICK_ACTION_ICONS: Record<string, React.ReactNode> = {
  list: (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  explain: (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  code: (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  edit: (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
}

interface DemoInputProps {
  onSend: (message: string) => void
  onChipAction: (action: string) => void
  disabled: boolean
  isLoading: boolean
}

export function DemoInput({
  onSend,
  onChipAction,
  disabled,
  isLoading,
}: DemoInputProps) {
  const [value, setValue] = useState("")
  const [justSent, setJustSent] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "24px"
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }, [value])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled || isLoading) return
    onSend(trimmed)
    setValue("")
    setJustSent(true)
    setTimeout(() => setJustSent(false), 1500)
  }

  return (
    <div className="shrink-0">
      {/* Action chips */}
      <div className="flex gap-1.5 px-4 py-2 flex-wrap items-center">
        {DEMO_QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => onChipAction(a.label)}
            disabled={disabled || isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 hover:brightness-125 active:scale-[0.97] disabled:opacity-50"
            style={{
              backgroundColor: "var(--chip-bg)",
              color: "var(--chip-text)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ opacity: 0.6 }}>
              {QUICK_ACTION_ICONS[a.icon] ?? null}
            </span>
            {a.label}
          </button>
        ))}
      </div>

      {/* Context bar */}
      <div className="px-4 pb-1">
        <div
          className="px-2 py-1 rounded-lg flex items-center justify-between"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--surface) 80%, transparent)",
            border: "1px solid var(--border)",
          }}
        >
          <span
            className="text-[9px]"
            style={{ color: "var(--text-muted)" }}
          >
            Context
          </span>
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 rounded-full overflow-hidden min-w-[60px] max-w-[100px]"
              style={{ backgroundColor: "var(--border)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: "3%",
                  backgroundColor: "var(--accent)",
                }}
              />
            </div>
            <span
              className="text-[9px] font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              1.1k / 400k
            </span>
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="px-4 pb-3 pt-1">
        <form onSubmit={handleSubmit}>
          <div
            className="flex items-center gap-1 rounded-xl px-3 py-2 border transition-all duration-150 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_1px_var(--accent)]"
            style={{
              backgroundColor: "var(--input-bg)",
              borderColor: "var(--input-border)",
            }}
          >
            {/* Toolbar icons */}
            <div className="flex items-center gap-0.5 mr-2">
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ color: "var(--text-muted)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M3 8h2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ color: "var(--text-muted)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="9"
                    y="2"
                    width="6"
                    height="12"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M5 11a7 7 0 0 0 14 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 19v3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ color: "var(--text-muted)" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>
            </div>

            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e as unknown as FormEvent)
                }
              }}
              placeholder="Ask anything..."
              disabled={disabled || isLoading}
              rows={1}
              className="flex-1 min-w-0 bg-transparent outline-none focus:outline-none focus:ring-0 text-[13px] resize-none py-1"
              style={{
                color: "var(--text)",
                caretColor: "var(--accent)",
                minHeight: "24px",
                maxHeight: "80px",
              }}
            />

            {/* Model chip */}
            <div
              className="px-1.5 py-0.5 rounded-md text-[10px] font-medium border shrink-0"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              Nano
            </div>

            {/* Send button */}
            <button
              type="submit"
              disabled={disabled || isLoading || !value.trim()}
              className="ml-2 flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 disabled:opacity-25 hover:brightness-110 active:scale-95 min-w-[28px]"
              style={{
                backgroundColor: justSent
                  ? "var(--success)"
                  : "var(--accent)",
                color: "#fff",
              }}
            >
              <AnimatePresence mode="wait">
                {justSent ? (
                  <motion.span
                    key="sent"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 25,
                    }}
                    className="flex items-center justify-center"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </motion.span>
                ) : (
                  <motion.span
                    key="send"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5" />
                      <path d="M5 12l7-7 7 7" />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </form>

        {/* Footer hints */}
        <div className="flex items-center justify-between mt-1 px-1">
          <p
            className="text-[9px]"
            style={{ color: "var(--text-muted)" }}
          >
            Enter to send · Shift+Enter for new line
          </p>
          <button
            className="text-[9px] transition-colors hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Reset chat
          </button>
        </div>
      </div>
    </div>
  )
}
