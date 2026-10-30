'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { 
  Plus, Lightbulb, Paperclip, Image,
  ChevronDown, Check, Sparkles, Zap, Brain, Github,
  SendHorizontal, Cpu
} from 'lucide-react'
import type { ChatModelOption } from '@/lib/api'
import { CoreSpinLoader } from '@/components/ui/core-spin-loader'

function modelIcon(provider: string): React.ReactNode {
  const cls = 'size-4 shrink-0'
  switch (provider) {
    case 'openai':
      return <Sparkles className={`${cls} text-emerald-400`} />
    case 'anthropic':
      return <Zap className={`${cls} text-violet-400`} />
    case 'google':
      return <Brain className={`${cls} text-cyan-400`} />
    case 'x-ai':
      return <Cpu className={`${cls} text-amber-400`} />
    default:
      return <Sparkles className={`${cls} text-zinc-400`} />
  }
}

// FIGMA ICON
function FigmaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M8 24C10.208 24 12 22.208 12 20V16H8C5.792 16 4 17.792 4 20C4 22.208 5.792 24 8 24Z" fill="currentColor"/>
      <path d="M4 12C4 9.792 5.792 8 8 8H12V16H8C5.792 16 4 14.208 4 12Z" fill="currentColor"/>
      <path d="M4 4C4 1.792 5.792 0 8 0H12V8H8C5.792 8 4 6.208 4 4Z" fill="currentColor"/>
      <path d="M12 0H16C18.208 0 20 1.792 20 4C20 6.208 18.208 8 16 8H12V0Z" fill="currentColor"/>
      <path d="M20 12C20 14.208 18.208 16 16 16C13.792 16 12 14.208 12 12C12 9.792 13.792 8 16 8C18.208 8 20 9.792 20 12Z" fill="currentColor"/>
    </svg>
  )
}

export function ModelSelector({
  models,
  selectedModelId,
  onModelChange,
  disabled = false,
}: {
  models: ChatModelOption[]
  selectedModelId: string
  onModelChange?: (modelId: string) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? models[0],
    [models, selectedModelId]
  )

  const handleSelect = (m: ChatModelOption) => {
    setIsOpen(false)
    onModelChange?.(m.id)
  }

  if (!models.length) {
    return (
      <span className="inline-flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[#5a5a5f]">
        <CoreSpinLoader size="sm" showText={false} className="min-h-0" />
        Loading models…
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="flex max-w-[min(100vw-8rem,14rem)] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-[#8a8a8f] transition-all duration-200 hover:bg-white/5 hover:text-white active:scale-95 disabled:opacity-40"
      >
        {selected ? modelIcon(selected.provider) : null}
        <span className="truncate">{selected?.label ?? 'Model'}</span>
        <ChevronDown className={`size-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 max-h-[min(70vh,420px)] min-w-[min(100vw-2rem,280px)] overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1e]/95 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="p-1.5">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#5a5a5f]">
                Model
              </div>
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-all duration-150 ${
                    selected?.id === m.id ? 'bg-white/10 text-white' : 'text-[#a0a0a5] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex-shrink-0">{modelIcon(m.provider)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{m.label}</div>
                    <span className="text-[11px] text-[#6a6a6f]">{m.description}</span>
                  </div>
                  {selected?.id === m.id && <Check className="size-4 shrink-0 text-cyan-300/90" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// CHAT INPUT
export function ChatInput({
  onSend,
  placeholder = "What do you want to build?",
  disabled = false,
  models = [],
  selectedModelId = "",
  onModelChange,
}: {
  onSend?: (message: string, options?: { model?: string }) => void
  placeholder?: string
  disabled?: boolean
  /** From GET /api/v1/chat/models */
  models?: ChatModelOption[]
  selectedModelId?: string
  onModelChange?: (modelId: string) => void
}) {
  const [message, setMessage] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSend?.(message, { model: selectedModelId || models[0]?.id })
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative w-full max-w-[680px] mx-auto">
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
      <div className="relative rounded-2xl bg-[#1e1e22] ring-1 ring-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_2px_20px_rgba(0,0,0,0.4)]">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full resize-none bg-transparent text-[15px] text-white placeholder-[#5a5a5f] px-5 pt-5 pb-3 focus:outline-none min-h-[80px] max-h-[200px] disabled:opacity-50"
            style={{ height: '80px' }}
          />
        </div>

        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className="flex items-center justify-center size-8 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-[#8a8a8f] hover:text-white transition-all duration-200 active:scale-95"
              >
                <Plus className={`size-4 transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />
              </button>

              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-50 bg-[#1a1a1e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="p-1.5 min-w-[180px]">
                      {[
                        { icon: <Paperclip className="size-4" />, label: 'Upload file' },
                        { icon: <Image className="size-4" />, label: 'Add image' },
                      ].map((item, i) => (
                        <button key={i} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#a0a0a5] hover:bg-white/5 hover:text-white transition-all duration-150">
                          {item.icon}
                          <span className="text-sm">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <ModelSelector
              models={models}
              selectedModelId={selectedModelId || models[0]?.id || ''}
              onModelChange={onModelChange}
              disabled={disabled}
            />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex cursor-not-allowed items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-[#6a6a6f] opacity-50 transition-all duration-200"
            >
              <Lightbulb className="size-4" />
              <span className="hidden sm:inline">Plan</span>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!message.trim() || disabled}
              className="flex items-center gap-2 rounded-full bg-[#1488fc] px-4 py-2 text-sm font-medium text-white shadow-[0_0_16px_rgba(20,136,252,0.22)] transition-all duration-200 hover:bg-[#1278e0] disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
            >
              <span className="hidden sm:inline">Send</span>
              <SendHorizontal className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ANNOUNCEMENT BADGE COMPONENT
function AnnouncementBadge({ text, href = "#" }: { text: string; href?: string }) {
  const content = (
    <>
      <span className="absolute top-0 left-0 right-0 h-1/2 pointer-events-none opacity-70 mix-blend-overlay" style={{ background: 'radial-gradient(ellipse at center top, rgba(255, 255, 255, 0.15) 0%, transparent 70%)' }} />
      <span className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] w-[100px] opacity-60" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.8) 20%, rgba(168, 85, 247, 0.8) 50%, rgba(124, 58, 237, 0.8) 80%, transparent 100%)', filter: 'blur(0.5px)' }} />
      <Zap className="size-4 relative z-10 text-white" />
      <span className="relative z-10 text-white font-medium">{text}</span>
    </>
  )

  const className = "relative inline-flex items-center gap-2 px-5 py-2 min-h-[40px] rounded-full text-sm overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
  const style = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
    backdropFilter: 'blur(20px) saturate(140%)',
    boxShadow: 'inset 0 1px rgba(255,255,255,0.2), inset 0 -1px rgba(0,0,0,0.1), 0 8px 32px -8px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.08)'
  }

  return href !== '#' ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>{content}</a>
  ) : (
    <button className={className} style={style}>{content}</button>
  )
}

// IMPORT BUTTONS COMPONENT
function ImportButtons({ onImport }: { onImport?: (source: string) => void }) {
  return (
    <div className="flex items-center gap-4 justify-center">
      <span className="text-sm text-[#6a6a6f]">or import from</span>
      <div className="flex gap-2">
        {[
          { id: 'figma', name: 'Figma', icon: <FigmaIcon className="size-4" /> },
          { id: 'github', name: 'GitHub', icon: <Github className="size-4" /> }
        ].map((option) => (
          <button
            key={option.id}
            onClick={() => onImport?.(option.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-[#0f0f0f] hover:bg-[#1a1a1e] text-[#8a8a8f] hover:text-white transition-all duration-200 active:scale-95"
          >
            {option.icon}
            <span>{option.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// MAIN BOLT CHAT COMPONENT
interface BoltChatProps {
  title?: string
  subtitle?: string
  announcementText?: string
  announcementHref?: string
  placeholder?: string
  className?: string
  onSend?: (message: string, options?: { model?: string }) => void
  onImport?: (source: string) => void
  chatModels?: ChatModelOption[]
  selectedModelId?: string
  onModelChange?: (modelId: string) => void
}

export function BoltStyleChat({
  title = "What will you",
  subtitle = "Create stunning apps & websites by chatting with AI.",
  announcementText = "Introducing Bolt V2",
  announcementHref = "#",
  placeholder = "What do you want to build?",
  className,
  onSend,
  onImport,
  chatModels = [],
  selectedModelId = "",
  onModelChange,
}: BoltChatProps) {
  return (
    <div
      className={`flex w-full flex-1 flex-col items-center justify-center overflow-hidden px-4 ${className || ''}`}
    >
      <div className="flex w-full max-w-[700px] flex-col items-center">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {title}{" "}
            <span className="text-white/85">ask</span> today?
          </h1>
          <p className="text-sm text-white/45 sm:text-[15px]">{subtitle}</p>
        </div>

        <div className="w-full">
          <ChatInput
            placeholder={placeholder}
            onSend={onSend}
            models={chatModels}
            selectedModelId={selectedModelId}
            onModelChange={onModelChange}
          />
        </div>

        {onImport && <ImportButtons onImport={onImport} />}
      </div>
    </div>
  )
}
