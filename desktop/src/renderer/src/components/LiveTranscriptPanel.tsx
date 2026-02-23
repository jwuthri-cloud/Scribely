import { useState, useRef, useEffect, useCallback } from 'react'
import { SpeakerLabel } from './SpeakerLabel'
import { AudioWaveform } from './AudioWaveform'
import type { TranscriptEntry } from '../types/transcript'

interface LiveTranscriptPanelProps {
  entries: TranscriptEntry[]
  isActive: boolean
  isRecording: boolean
  formattedDuration: string
  transcriptionMode: string // 'local' | 'cloud' | 'downloading'
  micActive: boolean
  tabActive: boolean
  onStop: () => void
  excludeMyMic?: boolean
  onToggleExcludeMyMic?: () => void
  error?: string | null
  modelDownloading?: boolean
  modelProgress?: number
  captureMode?: 'extension' | 'hybrid' | 'browser' | 'idle'
  nativeAvailable?: boolean
  extensionConnected?: boolean
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

export function LiveTranscriptPanel({
  entries,
  isActive,
  isRecording,
  formattedDuration,
  transcriptionMode,
  micActive,
  tabActive,
  onStop,
  excludeMyMic = false,
  onToggleExcludeMyMic,
  error,
  modelDownloading,
  modelProgress = 0,
  captureMode = 'browser',
  nativeAvailable = false,
  extensionConnected = false,
}: LiveTranscriptPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const handleCopy = useCallback(async () => {
    await window.electronAPI?.clipboardWriteText?.(formatTranscriptForCopy(entries))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [entries])

  // Auto-scroll transcript when expanded
  useEffect(() => {
    if (expanded && autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, expanded])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40
  }

  // Group consecutive entries by speaker
  const grouped: { speaker: string; entries: TranscriptEntry[] }[] = []
  for (const entry of entries) {
    const last = grouped[grouped.length - 1]
    if (last && last.speaker === entry.speaker) {
      last.entries.push(entry)
    } else {
      grouped.push({ speaker: entry.speaker, entries: [entry] })
    }
  }

  const lastEntry = entries[entries.length - 1]

  return (
    <div
      className="mx-3 mb-2 rounded-xl overflow-hidden shrink-0"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* ── Status bar (always visible) ────────────── */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Recording dot + duration */}
        <span
          className="w-2 h-2 rounded-full shrink-0 animate-pulse"
          style={{ backgroundColor: 'var(--error)' }}
        />
        {isRecording && (
          <span
            className="text-[11px] font-mono shrink-0"
            style={{ color: 'var(--text)' }}
          >
            {formattedDuration}
          </span>
        )}

        {/* Last utterance preview (collapsed) */}
        {!expanded && lastEntry && (
          <span
            className="text-[11px] truncate flex-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <span style={{ color: lastEntry.speaker === 'You' ? 'var(--accent)' : 'var(--success)' }}>
              {lastEntry.speaker}:
            </span>{' '}
            {lastEntry.text}
          </span>
        )}

        {expanded && (
          <span
            className="text-[11px] flex-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Transcript
          </span>
        )}

        {/* Copy transcript button (when expanded and has entries) */}
        {expanded && entries.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleCopy()
            }}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-[var(--surface-hover)] flex items-center gap-1 shrink-0"
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

        {/* Exclude my mic toggle — transcript & recording show others only */}
        {onToggleExcludeMyMic && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExcludeMyMic()
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 transition-colors"
            style={{
              backgroundColor: excludeMyMic
                ? 'color-mix(in srgb, var(--success) 20%, transparent)'
                : 'var(--surface-hover)',
              color: excludeMyMic ? 'var(--success)' : 'var(--text-muted)',
            }}
            title={
              excludeMyMic
                ? 'Recording others only — click to include your voice'
                : 'Click to exclude your voice (transcript & recording will show others only)'
            }
          >
            {excludeMyMic ? (
              <>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
                Others only
              </>
            ) : (
              <>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
                Include me
              </>
            )}
          </button>
        )}

        {/* Badges */}
        <div className="flex items-center gap-1 shrink-0">
          {micActive && (
            <span
              className="text-[9px] px-1 py-px rounded font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent)',
              }}
            >
              MIC
            </span>
          )}
          {tabActive && (
            <span
              className="text-[9px] px-1 py-px rounded font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--success) 15%, transparent)',
                color: 'var(--success)',
              }}
            >
              TAB
            </span>
          )}
          {captureMode === 'extension' && (
            <span
              className="text-[9px] px-1 py-px rounded font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent)',
              }}
            >
              EXT
            </span>
          )}
          {captureMode === 'hybrid' && (
            <span
              className="text-[9px] px-1 py-px rounded font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--warning) 15%, transparent)',
                color: 'var(--warning)',
              }}
            >
              NATIVE
            </span>
          )}
          <ModeBadge mode={transcriptionMode} />
        </div>

        {/* Expand/collapse chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="shrink-0 transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
          }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Audio waveform (always visible when active) ── */}
      {isActive && (
        <div className="px-3 pb-1">
          <AudioWaveform isActive={isActive} height={56} />
        </div>
      )}

      {/* ── Expanded transcript ─────────────────────── */}
      {expanded && (
        <>
          {error && (
            <div
              className="mx-3 mb-2 text-[11px] px-2 py-1 rounded"
              style={{
                backgroundColor: 'rgba(224, 108, 117, 0.15)',
                color: 'var(--error)',
              }}
            >
              {error}
            </div>
          )}

          {/* Model download progress */}
          {modelDownloading && (
            <div className="mx-3 mb-2 space-y-1">
              <div
                className="flex items-center justify-between text-[10px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>Downloading Whisper model...</span>
                <span>{modelProgress}%</span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--border)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ backgroundColor: 'var(--accent)', width: `${modelProgress}%` }}
                />
              </div>
            </div>
          )}

          <div
            ref={scrollRef}
            className="max-h-[200px] overflow-y-auto px-3 pb-2 space-y-2"
            onScroll={handleScroll}
          >
            {entries.length === 0 && (
              <div className="flex items-center gap-1.5 py-2">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Waiting for speech...
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
                <p
                  className="text-[12px] leading-relaxed pl-0.5"
                  style={{ color: 'var(--text)' }}
                >
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
          <div className="px-3 pb-2">
            <button
              onClick={(e) => { e.stopPropagation(); onStop() }}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ backgroundColor: 'var(--error)', color: '#fff' }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              Stop Meeting
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Mode badge with provider-specific labels & colors ──────
const MODE_BADGE_MAP: Record<string, { label: string; color: 'success' | 'warning' | 'accent' }> = {
  'local-fast': { label: 'SMALL', color: 'success' },
  'local-balanced': { label: 'MED', color: 'success' },
  'local-accurate': { label: 'TURBO', color: 'success' },
  deepgram: { label: 'NOVA', color: 'accent' },
  assemblyai: { label: 'ASSEMBLY', color: 'accent' },
  gladia: { label: 'GLADIA', color: 'accent' },
  revai: { label: 'REV', color: 'accent' },
  downloading: { label: 'DL...', color: 'accent' },
}

function ModeBadge({ mode }: { mode: string }) {
  const info = MODE_BADGE_MAP[mode] || { label: mode.toUpperCase(), color: 'warning' as const }
  return (
    <span
      className="text-[9px] px-1 py-px rounded font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, var(--${info.color}) 15%, transparent)`,
        color: `var(--${info.color})`,
      }}
    >
      {info.label}
    </span>
  )
}
