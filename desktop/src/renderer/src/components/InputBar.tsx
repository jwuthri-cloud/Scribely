import { useState, useRef, useEffect, type FormEvent } from 'react'
import { MicWaveform } from './MicWaveform'
import type { ChatAttachment } from '../types'

interface InputBarProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void
  disabled?: boolean
  isLoading?: boolean
  onStop?: () => void
  onScreenshot?: () => void
  pendingScreenshot?: string | null
  onClearScreenshot?: () => void
  isRecording?: boolean
  onToggleRecording?: () => void
  sttTranscript?: string
  onClearTranscript?: () => void
  micLevel?: number
  modelDownloading?: boolean
  modelProgress?: number
}

export function InputBar({
  onSend,
  disabled,
  isLoading,
  onStop,
  onScreenshot,
  pendingScreenshot,
  onClearScreenshot,
  isRecording,
  onToggleRecording,
  sttTranscript,
  onClearTranscript,
  micLevel = 0,
  modelDownloading,
  modelProgress = 0,
}: InputBarProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Append STT transcript to input value
  useEffect(() => {
    if (sttTranscript) {
      setValue((prev) => (prev ? `${prev} ${sttTranscript}` : sttTranscript))
      onClearTranscript?.()
    }
  }, [sttTranscript, onClearTranscript])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return

    const attachments: ChatAttachment[] = []
    if (pendingScreenshot) {
      attachments.push({ type: 'image', data: pendingScreenshot, label: 'Screenshot' })
    }

    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setValue('')
    inputRef.current?.focus()
  }

  return (
    <div className="px-4 pb-4 pt-2 shrink-0 space-y-2">
      {/* Screenshot preview */}
      {pendingScreenshot && (
        <div className="relative inline-block">
          <img
            src={pendingScreenshot}
            alt="Screenshot preview"
            className="h-16 rounded-lg border object-cover"
            style={{ borderColor: 'var(--border)' }}
          />
          <button
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
            style={{
              backgroundColor: 'var(--error)',
              color: '#fff',
            }}
            onClick={onClearScreenshot}
            aria-label="Remove screenshot"
          >
            x
          </button>
        </div>
      )}

      {/* Recording indicator + waveform */}
      {isRecording && (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: modelDownloading
              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
              : 'rgba(224, 108, 117, 0.1)',
          }}
        >
          <div
            className="flex items-center gap-2 text-xs px-2 py-1.5"
            style={{
              color: modelDownloading ? 'var(--accent)' : 'var(--error)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0 animate-pulse"
              style={{
                backgroundColor: modelDownloading ? 'var(--accent)' : 'var(--error)',
              }}
            />
            <span className="flex-1">
              {modelDownloading
                ? `Downloading transcription model... ${modelProgress}%`
                : 'Recording... press mic or hotkey to stop'}
            </span>
            {modelDownloading && (
              <div
                className="w-16 h-1 rounded-full overflow-hidden shrink-0"
                style={{ backgroundColor: 'var(--border)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: 'var(--accent)',
                    width: `${modelProgress}%`,
                  }}
                />
              </div>
            )}
          </div>
          {!modelDownloading && (
            <div className="px-2 pb-1.5">
              <MicWaveform level={micLevel} isActive={isRecording} height={28} />
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          className="flex items-center rounded-xl px-3 py-2 border transition-all duration-150 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_1px_var(--accent)]"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--input-border)',
          }}
        >
          {/* Toolbar buttons */}
          <div className="flex items-center gap-0.5 mr-2">
            {/* Screenshot button */}
            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 hover:bg-[var(--surface-hover)]"
              style={{ color: pendingScreenshot ? 'var(--accent)' : 'var(--text-muted)' }}
              onClick={onScreenshot}
              title="Take screenshot (⌥S)"
              aria-label="Take screenshot"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3 8h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            {/* Mic button */}
            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 hover:bg-[var(--surface-hover)]"
              style={{ color: isRecording ? 'var(--error)' : 'var(--text-muted)' }}
              onClick={onToggleRecording}
              title="Toggle recording (⌥A)"
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M12 19v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask anything..."
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
            autoFocus
          />

          {/* Send or Stop button */}
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="ml-2 flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 hover:brightness-110 active:scale-95"
              style={{
                backgroundColor: 'var(--error)',
                color: '#fff',
              }}
              title="Stop generation"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <rect x="1" y="1" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || !value.trim()}
              className="ml-2 flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 disabled:opacity-25 hover:brightness-110 active:scale-95"
              style={{
                backgroundColor: 'var(--accent)',
                color: '#fff',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
