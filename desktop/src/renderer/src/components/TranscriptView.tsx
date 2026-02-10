import { useEffect, useRef } from 'react'
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

export function TranscriptView({ entries, isActive }: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

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
  )
}
