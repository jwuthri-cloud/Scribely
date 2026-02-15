import { useState, useEffect, useCallback } from 'react'

type ViewId = 'chat' | 'llm' | 'settings'

interface TitleBarProps {
  view: ViewId
  onSetView: (view: ViewId) => void
  onReset?: () => void
  meetingActive?: boolean
  meetingDuration?: string
  onToggleMeeting?: () => void
}

/** Small icon button used in the title bar with a custom tooltip */
function TitleBtn({
  onClick,
  label,
  tooltip,
  active,
  color,
  children,
}: {
  onClick: () => void
  label: string
  tooltip: string
  active?: boolean
  color?: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)]"
        style={{
          color: color ?? (active ? 'var(--accent)' : 'var(--text-muted)'),
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </button>
      {hovered && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none z-50"
          style={{
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}

export function TitleBar({
  view,
  onSetView,
  onReset,
  meetingActive,
  meetingDuration = '00:00',
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

  const viewTitle = view === 'settings' ? 'Settings' : view === 'llm' ? 'LLM' : 'Scribely'

  return (
    <div
      className="flex items-center justify-between px-4 py-2 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side: close button + back arrow (when not in chat) */}
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

        {view !== 'chat' && (
          <TitleBtn onClick={() => onSetView('chat')} label="Back to chat" tooltip="Back to chat">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 2L3.5 6L7.5 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </TitleBtn>
        )}
      </div>

      <span
        className="text-[11px] font-medium tracking-wide uppercase select-none"
        style={{ color: 'var(--text-muted)' }}
      >
        {viewTitle}
      </span>

      {/* Right side: invisibility + meeting toggle + reset + LLM + gear */}
      <div className="flex items-center gap-0.5">
        {/* Invisibility toggle — hide/show from screen sharing */}
        {view === 'chat' && (
          <TitleBtn
            onClick={handleToggleInvisibility}
            label={invisible ? 'Make visible to screen share' : 'Hide from screen share'}
            tooltip={invisible ? 'Hidden from screen share' : 'Visible to screen share'}
            active={invisible}
          >
            {invisible ? (
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
          </TitleBtn>
        )}

        {/* Meeting toggle — pill-style Rec button */}
        {view === 'chat' && onToggleMeeting && (
          <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {meetingActive ? (
              <button
                onClick={onToggleMeeting}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 hover:brightness-110"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--error) 18%, transparent)',
                  color: 'var(--error)',
                  border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
                }}
                aria-label="Stop meeting"
                title="Stop meeting capture"
              >
                {/* Stop square */}
                <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="1" y="1" width="10" height="10" rx="1.5" />
                </svg>
                {/* Animated waveform bars */}
                <div className="flex items-center gap-[2px] h-3">
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[2px] rounded-full animate-pulse"
                      style={{
                        backgroundColor: 'var(--error)',
                        height: `${5 + (i % 3) * 2}px`,
                        animationDelay: `${i * 150}ms`,
                        animationDuration: '1s',
                      }}
                    />
                  ))}
                </div>
                {/* Timer */}
                <span className="font-mono tabular-nums">{meetingDuration}</span>
              </button>
            ) : (
              <button
                onClick={onToggleMeeting}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 hover:bg-[var(--surface-hover)]"
                style={{
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
                aria-label="Start meeting"
                title="Start meeting capture (⌥M)"
              >
                {/* Record circle */}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--error)', opacity: 0.7 }}
                />
                Rec
              </button>
            )}
          </div>
        )}

        {/* Reset chat */}
        {view === 'chat' && onReset && (
          <TitleBtn
            onClick={onReset}
            label="Reset chat"
            tooltip="Reset chat (⌥R)"
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
          </TitleBtn>
        )}

        {/* LLM tab */}
        <TitleBtn
          onClick={() => onSetView(view === 'llm' ? 'chat' : 'llm')}
          label="LLM settings"
          tooltip="LLM"
          active={view === 'llm'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </TitleBtn>

        {/* Settings gear */}
        <TitleBtn
          onClick={() => onSetView(view === 'settings' ? 'chat' : 'settings')}
          label={view === 'settings' ? 'Back to chat' : 'Settings'}
          tooltip="Settings"
          active={view === 'settings'}
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
        </TitleBtn>
      </div>
    </div>
  )
}
