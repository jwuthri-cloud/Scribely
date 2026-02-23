import { useRef, useEffect, useState, useCallback } from 'react'
import { SpeakerLabel } from './SpeakerLabel'
import { AudioWaveform } from './AudioWaveform'
import type { TranscriptEntry } from '../types/transcript'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTranscriptForCopy(entries: TranscriptEntry[]): string {
  const grouped: { speaker: string; entries: TranscriptEntry[] }[] = []
  for (const entry of entries) {
    const last = grouped[grouped.length - 1]
    if (last && last.speaker === entry.speaker) {
      last.entries.push(entry)
    } else {
      grouped.push({ speaker: entry.speaker, entries: [entry] })
    }
  }
  return grouped
    .map((g) => `[${formatTime(g.entries[0].startTime)}] ${g.speaker}: ${g.entries.map((e) => e.text).join(' ')}`)
    .join('\n\n')
}

export interface LiveTranscriptSidePanelProps {
  entries: TranscriptEntry[]
  isActive: boolean
  isRecording: boolean
  formattedDuration: string
  transcriptionMode: string
  micActive: boolean
  tabActive: boolean
  onStop: () => void
  excludeMyMic?: boolean
  onToggleExcludeMyMic?: () => void
  error?: string | null
  modelDownloading?: boolean
  modelProgress?: number
  onClose: () => void
}

export function LiveTranscriptSidePanel({
  entries,
  isActive,
  isRecording,
  formattedDuration,
  onStop,
  excludeMyMic = false,
  onToggleExcludeMyMic,
  error,
  modelDownloading,
  modelProgress = 0,
  onClose,
}: LiveTranscriptSidePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await window.electronAPI?.clipboardWriteText?.(formatTranscriptForCopy(entries))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [entries])

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40
  }

  const grouped: { speaker: string; entries: TranscriptEntry[] }[] = []
  for (const entry of entries) {
    const last = grouped[grouped.length - 1]
    if (last && last.speaker === entry.speaker) {
      last.entries.push(entry)
    } else {
      grouped.push({ speaker: entry.speaker, entries: [entry] })
    }
  }

  return (
    <div
      className="w-80 shrink-0 flex flex-col h-full border-r overflow-hidden"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0 animate-pulse"
            style={{ backgroundColor: 'var(--error)' }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
            Transcript
          </span>
          {isRecording && (
            <span
              className="text-[10px] font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              {formattedDuration}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              onClick={handleCopy}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--surface-hover)] flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {copied ? (
                <>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Audio waveform when active */}
      {isActive && (
        <div className="px-3 py-2 shrink-0">
          <AudioWaveform isActive={isActive} height={48} />
        </div>
      )}

      {/* Record toggle */}
      {onToggleExcludeMyMic && (
        <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Record:
          </span>
          <div
            className="flex rounded-lg p-0.5 border"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border)',
            }}
          >
            <button
              onClick={() => !excludeMyMic && onToggleExcludeMyMic()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
              style={{
                backgroundColor: !excludeMyMic ? 'var(--surface)' : 'transparent',
                color: !excludeMyMic ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              Everyone
            </button>
            <button
              onClick={() => !excludeMyMic && onToggleExcludeMyMic()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
              style={{
                backgroundColor: excludeMyMic ? 'var(--surface)' : 'transparent',
                color: excludeMyMic ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              Others only
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="mx-3 mb-2 text-[11px] px-2 py-1 rounded shrink-0"
          style={{
            backgroundColor: 'rgba(224, 108, 117, 0.15)',
            color: 'var(--error)',
          }}
        >
          {error}
        </div>
      )}

      {modelDownloading && (
        <div className="mx-3 mb-2 space-y-1 shrink-0">
          <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <span>Downloading Whisper model...</span>
            <span>{modelProgress}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ backgroundColor: 'var(--accent)', width: `${modelProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Transcript content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-0"
        onScroll={handleScroll}
      >
        {entries.length === 0 && (
          <div className="flex items-center gap-1.5 py-8">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {isActive ? 'Waiting for speech...' : 'No transcript yet'}
            </span>
          </div>
        )}

        {grouped.map((group, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <SpeakerLabel speaker={group.speaker} confidence={group.entries[0].confidence} />
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {formatTime(group.entries[0].startTime)}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed pl-0.5" style={{ color: 'var(--text)' }}>
              {group.entries.map((e) => e.text).join(' ')}
            </p>
          </div>
        ))}

        {isActive && entries.length > 0 && (
          <div className="flex items-center gap-1 py-0.5">
            <span
              className="w-1 h-1 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Listening...
            </span>
          </div>
        )}
      </div>

      {/* Stop button */}
      {isActive && (
        <div className="px-3 py-2 shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onStop}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ backgroundColor: 'var(--error)', color: '#fff' }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop Meeting
          </button>
        </div>
      )}
    </div>
  )
}
