import { useState, useEffect, useCallback } from 'react'
import { HotkeyMenu } from './HotkeyMenu'

type ViewId = 'chat' | 'llm' | 'settings'

/** Wraps content with a hover tooltip */
function TooltipWrap({
  tooltip,
  children,
}: {
  tooltip: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap pointer-events-none z-[9999]"
          style={{
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}

/** Small button with a custom tooltip that renders above everything (z-[9999]) */
function NavBtn({
  onClick,
  tooltip,
  children,
  ...rest
}: {
  onClick: () => void
  tooltip: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children && (
        <button type="button" onClick={onClick} {...rest}>
          {children}
        </button>
      )}
      {hovered && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap pointer-events-none z-[9999]"
          style={{
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}

interface CompactNavbarProps {
  meetingActive: boolean
  meetingDuration: string
  onToggleMeeting: () => void
  onSetView: (view: ViewId) => void
  onClose: () => void
  onToggleCompactMode?: () => void
  insightsPanelExpanded?: boolean
  onToggleInsightsPanel?: () => void
  transcriptPanelExpanded?: boolean
  onToggleTranscriptPanel?: () => void
}

/**
 * Slim pill-shaped navbar for compact mode.
 * Layout: [X close] ... [meeting toggle] [waveform+timer] ... [Ask AI ⌘⏎] [Hidden ⌥T] [Settings]
 */
export function CompactNavbar({
  meetingActive,
  meetingDuration,
  onToggleMeeting,
  onSetView,
  onClose,
  onToggleCompactMode,
  insightsPanelExpanded = false,
  onToggleInsightsPanel,
  transcriptPanelExpanded = false,
  onToggleTranscriptPanel,
}: CompactNavbarProps) {
  const [compactHovered, setCompactHovered] = useState(false)
  const [hiddenHovered, setHiddenHovered] = useState(false)
  const [invisible, setInvisible] = useState(true)

  useEffect(() => {
    window.electronAPI?.getInvisibility().then(setInvisible)
  }, [])

  const handleHideWindow = useCallback(() => {
    window.electronAPI?.toggleWindowVisibility?.()
  }, [])

  const handleToggleInvisibility = useCallback(async () => {
    const newState = await window.electronAPI?.toggleInvisibility()
    if (newState !== undefined) setInvisible(newState)
  }, [])

  return (
    <div
      className="flex items-center gap-1.5 px-4 py-2 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* ── Left: traffic-light buttons (red close, green compact) + Meeting button ── */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Red: close */}
        <NavBtn
          onClick={onClose}
          tooltip="Close"
          className="flex items-center justify-center w-3 h-3 rounded-full transition-all duration-150 hover:brightness-110"
          style={{ backgroundColor: 'var(--error)' }}
          aria-label="Close"
        >
          <span />
        </NavBtn>

        {/* Green: compact mode toggle (expand back to full view) */}
        {onToggleCompactMode && (
          <TooltipWrap tooltip="Advanced mode">
            <button
              className="flex items-center justify-center w-3 h-3 rounded-full transition-all duration-150"
              style={{
                backgroundColor: 'var(--success)',
                boxShadow: compactHovered ? '0 0 6px var(--success)' : 'none',
              } as React.CSSProperties}
              onMouseEnter={() => setCompactHovered(true)}
              onMouseLeave={() => setCompactHovered(false)}
              onClick={onToggleCompactMode}
              aria-label="Expand"
            >
              <span />
            </button>
          </TooltipWrap>
        )}

        {/* Blue: hide/show window */}
        <TooltipWrap tooltip="Hide window (⌥T)">
          <button
            className="flex items-center justify-center w-3 h-3 rounded-full transition-all duration-150"
            style={{
              backgroundColor: 'var(--accent)',
              boxShadow: hiddenHovered ? '0 0 6px var(--accent)' : 'none',
            } as React.CSSProperties}
            onMouseEnter={() => setHiddenHovered(true)}
            onMouseLeave={() => setHiddenHovered(false)}
            onClick={handleHideWindow}
            aria-label="Hide window"
          >
            <span />
          </button>
        </TooltipWrap>

        {/* Invisible/show: screen share visibility */}
        <TooltipWrap
          tooltip={
            invisible
              ? 'Hidden from screen share'
              : 'Visible in screen share'
          }
        >
          <button
            className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)]"
            style={{
              color: invisible ? 'var(--text-muted)' : 'var(--accent)',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onClick={handleToggleInvisibility}
            aria-label={invisible ? 'Make visible to screen share' : 'Hide from screen share'}
          >
            {invisible ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" strokeWidth="1.8" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </TooltipWrap>

        {/* Meeting button — pill-shaped, labeled, clear state */}
        {meetingActive ? (
          /* Active: red pill with stop icon + waveform + timer */
          <NavBtn
            onClick={onToggleMeeting}
            tooltip="Stop meeting capture"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 hover:brightness-110"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--error) 18%, transparent)',
              color: 'var(--error)',
              border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
            }}
            aria-label="Stop meeting"
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
          </NavBtn>
        ) : (
          /* Inactive: subtle "Rec" pill */
          <NavBtn
            onClick={onToggleMeeting}
            tooltip="Start meeting capture (⌥M)"
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 hover:bg-[var(--surface-hover)]"
            style={{
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            aria-label="Start meeting"
          >
            {/* Record circle */}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: 'var(--error)', opacity: 0.7 }}
            />
            Rec
          </NavBtn>
        )}
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Right: actions ── */}
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Transcript expand toggle — only when meeting active */}
        {meetingActive && onToggleTranscriptPanel && (
          <TooltipWrap tooltip={transcriptPanelExpanded ? 'Collapse transcript' : 'Expand transcript'}>
            <button
              onClick={onToggleTranscriptPanel}
              className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)]"
              style={{
                color: transcriptPanelExpanded ? 'var(--accent)' : 'var(--text-muted)',
              }}
              aria-label="Toggle transcript panel"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
            </button>
          </TooltipWrap>
        )}

        {/* Live Insights toggle — only when meeting active */}
        {meetingActive && onToggleInsightsPanel && (
          <TooltipWrap tooltip={insightsPanelExpanded ? 'Hide insights' : 'Show live insights'}>
            <button
              onClick={onToggleInsightsPanel}
              className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)]"
              style={{
                color: insightsPanelExpanded ? 'var(--accent)' : 'var(--text-muted)',
              }}
              aria-label="Toggle live insights"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
              </svg>
            </button>
          </TooltipWrap>
        )}

        {/* Hotkey shortcuts menu */}
        <HotkeyMenu size="sm" tooltip="Keyboard shortcuts" />

        {/* Settings gear */}
        <NavBtn
          onClick={() => onSetView('settings')}
          tooltip="Settings"
          className="flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150 hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Settings"
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
        </NavBtn>
      </div>
    </div>
  )
}
