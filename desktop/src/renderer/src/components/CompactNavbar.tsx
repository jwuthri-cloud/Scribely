import { useState, useEffect, useCallback } from 'react'

type ViewId = 'chat' | 'llm' | 'settings'

interface CompactNavbarProps {
  meetingActive: boolean
  meetingDuration: string
  onToggleMeeting: () => void
  onFocusInput: () => void
  onSetView: (view: ViewId) => void
  onClose: () => void
}

/**
 * Slim pill-shaped navbar for compact mode.
 * Always shows: Settings gear, Close (X).
 * When meeting is active: adds Pause/Stop, waveform, timer.
 * "Ask AI" focuses the input bar.
 */
export function CompactNavbar({
  meetingActive,
  meetingDuration,
  onToggleMeeting,
  onFocusInput,
  onSetView,
  onClose,
}: CompactNavbarProps) {
  const [invisible, setInvisible] = useState(true)

  // Load initial invisibility state
  useEffect(() => {
    window.electronAPI?.getInvisibility().then(setInvisible)
  }, [])

  const handleToggleInvisibility = useCallback(async () => {
    const newState = await window.electronAPI?.toggleInvisibility()
    if (newState !== undefined) setInvisible(newState)
  }, [])

  return (
    <div
      className="flex items-center gap-1 px-3 py-1.5 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: meeting controls */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Stop/Start meeting */}
        <button
          onClick={onToggleMeeting}
          className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)]"
          style={{
            color: meetingActive ? 'var(--error)' : 'var(--text-muted)',
          }}
          aria-label={meetingActive ? 'Stop meeting' : 'Start meeting'}
          title={meetingActive ? 'Stop meeting' : 'Start meeting'}
        >
          {meetingActive ? (
            /* Stop square */
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          ) : (
            /* Play/start */
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 12h8M8 9h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* Waveform + timer when meeting active */}
        {meetingActive && (
          <div className="flex items-center gap-1.5">
            {/* Animated waveform bars */}
            <div className="flex items-center gap-[2px] h-3">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full animate-pulse"
                  style={{
                    backgroundColor: 'var(--error)',
                    height: `${6 + (i % 3) * 3}px`,
                    animationDelay: `${i * 150}ms`,
                    animationDuration: '1s',
                  }}
                />
              ))}
            </div>
            {/* Timer */}
            <span
              className="text-[10px] font-mono tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {meetingDuration}
            </span>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: actions */}
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Ask AI button */}
        <button
          onClick={onFocusInput}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-150 hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--accent)' }}
          title="Focus input (⌘⏎)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Ask AI
        </button>

        {/* Show/Hide (invisibility toggle) */}
        <button
          onClick={handleToggleInvisibility}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-150 hover:bg-[var(--surface-hover)]"
          style={{ color: invisible ? 'var(--text-muted)' : 'var(--accent)' }}
          title={invisible ? 'Hidden from screen share' : 'Visible to screen share'}
        >
          {invisible ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path
                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path
                d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
          {invisible ? 'Hidden' : 'Visible'}
        </button>

        {/* Settings gear */}
        <button
          onClick={() => onSetView('settings')}
          className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Settings"
          title="Settings"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded-md transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--error)_20%,transparent)]"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Close"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
