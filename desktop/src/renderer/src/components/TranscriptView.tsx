import { useEffect, useRef, useState, useCallback } from 'react'
import { SpeakerLabel } from './SpeakerLabel'
import type { TranscriptEntry } from '../types/transcript'

interface TranscriptViewProps {
  entries: TranscriptEntry[]
  isActive: boolean
}

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

export function TranscriptView({ entries, isActive }: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    await window.electronAPI?.clipboardWriteText?.(formatTranscriptForCopy(entries))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [entries])

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  // Detect manual scroll to pause auto-scroll
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 60
  }

  // ── Empty states ─────────────────────────────────────
  if (entries.length === 0 && !isActive) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <div className="text-2xl opacity-40">🎙</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Start a meeting session to see the live transcript
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            Captures tab audio + mic separately for speaker attribution
          </p>
        </div>
      </div>
    )
  }

  if (entries.length === 0 && isActive) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--error)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Listening...
            </span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            Waiting for speech to begin
          </p>
        </div>
      </div>
    )
  }

  // ── Group consecutive entries by same speaker ────────
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
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="shrink-0 flex items-center justify-end px-4 py-2 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={handleCopy}
          className="px-2 py-1 rounded-lg text-[11px] font-medium hover:bg-[var(--surface-hover)] flex items-center gap-1.5"
          style={{ color: 'var(--text-muted)' }}
        >
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy transcript
            </>
          )}
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        onScroll={handleScroll}
      >
      {grouped.map((group, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-2">
            <SpeakerLabel
              speaker={group.speaker}
              confidence={group.entries[0].confidence}
            />
            <span
              className="text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {formatTime(group.entries[0].startTime)}
            </span>
          </div>
          <p
            className="text-sm leading-relaxed pl-0.5"
            style={{
              color: 'var(--text)',
              fontStyle:
                group.entries[0].confidence < 0.6 ? 'italic' : 'normal',
              opacity: group.entries[0].confidence < 0.6 ? 0.7 : 1,
            }}
          >
            {group.entries.map((e) => e.text).join(' ')}
          </p>
        </div>
      ))}

      {/* Live indicator at bottom */}
      {isActive && (
        <div className="flex items-center gap-1.5 py-1">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--error)' }}
          />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Listening...
          </span>
        </div>
      )}
      </div>
    </div>
  )
}
