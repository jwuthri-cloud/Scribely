interface RecordingBarProps {
  isActive: boolean
  isRecording: boolean
  formattedDuration: string
  transcriptionMode: string
  micActive: boolean
  tabActive: boolean
  onStart: () => void
  onStop: () => void
  modelDownloading?: boolean
  modelProgress?: number
  onDownloadModel?: () => void
  modelAvailable?: boolean
}

export function RecordingBar({
  isActive,
  isRecording,
  formattedDuration,
  transcriptionMode,
  micActive,
  tabActive,
  onStart,
  onStop,
  modelDownloading,
  modelProgress = 0,
  onDownloadModel,
  modelAvailable,
}: RecordingBarProps) {
  return (
    <div className="px-4 py-3 space-y-2 shrink-0">
      {/* ── Main controls row ───────────────────────── */}
      <div className="flex items-center gap-2">
        {!isActive ? (
          <button
            onClick={onStart}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:brightness-110 active:scale-95"
            style={{ backgroundColor: 'var(--success)', color: '#fff' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
            Start Meeting
          </button>
        ) : (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:brightness-110 active:scale-95"
            style={{ backgroundColor: 'var(--error)', color: '#fff' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop
          </button>
        )}

        {isActive && (
          <div className="flex items-center gap-2 flex-1">
            {/* Duration */}
            {isRecording && (
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--error)' }}
                />
                <span
                  className="text-xs font-mono"
                  style={{ color: 'var(--text)' }}
                >
                  {formattedDuration}
                </span>
              </div>
            )}

            {/* Source + mode indicators */}
            <div className="flex items-center gap-1 ml-auto">
              {micActive && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--accent) 15%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  MIC
                </span>
              )}
              {tabActive && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--success) 15%, transparent)',
                    color: 'var(--success)',
                  }}
                >
                  TAB
                </span>
              )}
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor:
                    transcriptionMode.startsWith('local')
                      ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                      : transcriptionMode === 'downloading'
                        ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                        : 'color-mix(in srgb, var(--warning) 15%, transparent)',
                  color:
                    transcriptionMode.startsWith('local')
                      ? 'var(--success)'
                      : transcriptionMode === 'downloading'
                        ? 'var(--accent)'
                        : 'var(--warning)',
                }}
              >
                {transcriptionMode === 'local-fast' ? 'SMALL' : transcriptionMode === 'local-balanced' ? 'MED' : transcriptionMode === 'local-accurate' ? 'TURBO' : transcriptionMode === 'groq' ? 'GROQ' : transcriptionMode === 'deepgram' ? 'DEEPGRAM' : transcriptionMode === 'downloading' ? 'DL...' : transcriptionMode.toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Model download prompt ───────────────────── */}
      {!modelAvailable && !modelDownloading && !isActive && (
        <div
          className="flex items-center justify-between text-[11px] px-2.5 py-2 rounded-lg"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--warning) 10%, transparent)',
            color: 'var(--text-muted)',
          }}
        >
          <span>Download Whisper for offline transcription?</span>
          <button
            onClick={onDownloadModel}
            className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors hover:brightness-125"
            style={{ color: 'var(--accent)' }}
          >
            Download (~142 MB)
          </button>
        </div>
      )}

      {/* ── Model download progress ─────────────────── */}
      {modelDownloading && (
        <div className="space-y-1">
          <div
            className="flex items-center justify-between text-[10px]"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>Downloading Whisper model...</span>
            <span>{modelProgress}%</span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                backgroundColor: 'var(--accent)',
                width: `${modelProgress}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
