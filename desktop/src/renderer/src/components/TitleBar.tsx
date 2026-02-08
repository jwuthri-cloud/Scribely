import { useState } from 'react'

export function TitleBar() {
  const [closeHovered, setCloseHovered] = useState(false)

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
      {/* Traffic-light close button — no-drag so it's clickable */}
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

      <span
        className="text-[11px] font-medium tracking-wide uppercase select-none"
        style={{ color: 'var(--text-muted)' }}
      >
        AssistMe
      </span>

      {/* Spacer for symmetry */}
      <div className="w-3" />
    </div>
  )
}
