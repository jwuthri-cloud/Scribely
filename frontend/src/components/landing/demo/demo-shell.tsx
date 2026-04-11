"use client"

interface DemoShellProps {
  meetingDuration: string
  children: React.ReactNode
}

function SourceBadge({
  label,
  active,
}: {
  label: string
  active: boolean
}) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: active
          ? "color-mix(in srgb, var(--accent) 20%, transparent)"
          : "var(--surface)",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 40%, transparent)" : "var(--border)"}`,
      }}
    >
      {label}
    </span>
  )
}

export function DemoShell({ meetingDuration, children }: DemoShellProps) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden border"
      style={{
        backgroundColor: "var(--overlay)",
        borderColor: "var(--border)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        height: "600px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Left: traffic lights + rec pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "var(--error)" }}
            />
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "var(--success)" }}
            />
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "var(--accent)" }}
            />
          </div>

          {/* Invisible-to-screenshare icon */}
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" strokeWidth="1.8" />
            </svg>
          </div>

          {/* Recording pill */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--error) 18%, transparent)",
              color: "var(--error)",
              border:
                "1px solid color-mix(in srgb, var(--error) 30%, transparent)",
            }}
          >
            <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="10" height="10" rx="1.5" />
            </svg>
            <div className="flex items-center gap-[2px] h-3">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full animate-pulse"
                  style={{
                    backgroundColor: "var(--error)",
                    height: `${5 + (i % 3) * 2}px`,
                    animationDelay: `${i * 150}ms`,
                    animationDuration: "1s",
                  }}
                />
              ))}
            </div>
            <span className="font-mono tabular-nums">{meetingDuration}</span>
          </div>
        </div>

        {/* Right: title bar icons */}
        <div className="flex items-center gap-1">
          {/* Add new chat */}
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          {/* Sync */}
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          {/* Settings gear */}
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md"
            style={{ color: "var(--text-muted)" }}
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
          </div>
        </div>
      </div>

      {/* Source badges row */}
      <div className="flex items-center gap-2 px-4 py-1.5 shrink-0">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--error)" }}
        />
        <span className="text-[11px]" style={{ color: "var(--error)" }}>
          Live Transcript
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          ✦ Copy
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <SourceBadge label="MIC" active />
          <SourceBadge label="TAB" active />
          <SourceBadge label="EXT" active />
          <SourceBadge label="MED" active={false} />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
