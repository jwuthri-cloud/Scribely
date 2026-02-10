import { useState, useEffect, useCallback } from 'react'

interface TitleBarProps {
  view: 'chat' | 'settings'
  onToggleView: () => void
  onReset?: () => void
  meetingActive?: boolean
  onToggleMeeting?: () => void
}

export function TitleBar({
  view,
  onToggleView,
  onReset,
  meetingActive,
  onToggleMeeting,
}: TitleBarProps) {
  const [closeHovered, setCloseHovered] = useState(false)
  const [invisible, setInvisible] = useState(true)

  // Load initial invisibility state
  useEffect(() => {
    window.electronAPI?.getInvisibility().then(setInvisible)
  }, [])

  const handleToggleInvisibility = useCallback(async () => {
    const newState = await window.electronAPI?.toggleInvisibility()
    if (newState !== undefined) setInvisible(newState)
  }, [])

  const handleClose = () => {
    if (window.electronAPI?.quit) {
      window.electronAPI.quit()
    } else {
      window.close()
    }
  }

  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side: close button + back arrow (in settings) */}
      <div className="flex items-center gap-2">
        <button
          className="w-3 h-3 rounded-full transition-all duration-150"
          style={{
            backgroundColor: closeHovered ? 'var(--error)' : 'var(--border)',
            boxShadow: closeHovered ? '0 0 6px var(--error)' : 'none',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
          onClick={handleClose}
          aria-label="Close"
        />

        {view === 'settings' && (
          <button
            className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:brightness-125"
            style={{
              color: 'var(--text-muted)',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onClick={onToggleView}
            aria-label="Back to chat"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 2L3.5 6L7.5 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      <span
        className="text-[11px] font-medium tracking-wide uppercase select-none"
        style={{ color: 'var(--text-muted)' }}
      >
        {view === 'settings' ? 'Settings' : 'AssistMe'}
      </span>

      {/* Right side: invisibility + meeting toggle + reset + gear */}
      <div className="flex items-center gap-1.5">
        {/* Invisibility toggle — hide/show from screen sharing */}
        {view === 'chat' && (
          <button
            className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:brightness-125"
            style={{
              color: invisible ? 'var(--accent)' : 'var(--text-muted)',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onClick={handleToggleInvisibility}
            aria-label={invisible ? 'Make visible to screen share' : 'Hide from screen share'}
            title={invisible ? 'Hidden from screen share' : 'Visible to screen share'}
          >
            {invisible ? (
              /* Eye-off icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
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
              /* Eye icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
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
          </button>
        )}

        {/* Meeting toggle — starts/stops meeting capture */}
        {view === 'chat' && onToggleMeeting && (
          <button
            className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:brightness-125"
            style={{
              color: meetingActive ? 'var(--error)' : 'var(--text-muted)',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onClick={onToggleMeeting}
            aria-label={meetingActive ? 'Stop meeting' : 'Start meeting'}
            title={meetingActive ? 'Stop meeting' : 'Start meeting capture'}
          >
            {meetingActive ? (
              /* Stop icon when active */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
              </svg>
            ) : (
              /* Transcript icon when inactive */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 12h8M8 9h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}

        {view === 'chat' && onReset && (
          <button
            className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:brightness-125"
            style={{
              color: 'var(--text-muted)',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onClick={onReset}
            aria-label="Reset chat"
            title="Reset chat"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M10 3H4.5C3.12 3 2 4.12 2 5.5S3.12 8 4.5 8H8"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <path
                d="M8.5 1L10.5 3L8.5 5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        <button
          className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:brightness-125"
          style={{
            color: view === 'settings' ? 'var(--accent)' : 'var(--text-muted)',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onClick={onToggleView}
          aria-label={view === 'settings' ? 'Back to chat' : 'Settings'}
          title="Settings"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
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
      </div>
    </div>
  )
}
