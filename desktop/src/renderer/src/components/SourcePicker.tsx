interface SourceInfo {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnailDataUrl: string
}

interface SourcePickerProps {
  sources: SourceInfo[]
  onSelect: (sourceId: string) => void
  onDismiss: () => void
}

export function SourcePicker({ sources, onSelect, onDismiss }: SourcePickerProps) {
  const screens = sources.filter((s) => s.type === 'screen')
  const windows = sources.filter((s) => s.type === 'window')

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-[380px] max-h-[500px] rounded-xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            Choose what to record
          </span>
          <button
            onClick={onDismiss}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Source list */}
        <div className="overflow-y-auto p-3 space-y-3">
          {screens.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
                Screens
              </div>
              <div className="grid grid-cols-2 gap-2">
                {screens.map((s) => (
                  <SourceCard key={s.id} source={s} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )}

          {windows.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
                Windows
              </div>
              <div className="grid grid-cols-2 gap-2">
                {windows.map((s) => (
                  <SourceCard key={s.id} source={s} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SourceCard({ source, onSelect }: { source: SourceInfo; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(source.id)}
      className="rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
      style={{ backgroundColor: 'var(--overlay)', border: '1px solid var(--border)' }}
    >
      <img
        src={source.thumbnailDataUrl}
        alt={source.name}
        className="w-full aspect-video object-cover"
        style={{ backgroundColor: '#000' }}
      />
      <div
        className="px-2 py-1.5 text-[11px] truncate"
        style={{ color: 'var(--text)', borderTop: '1px solid var(--border)' }}
      >
        {source.name}
      </div>
    </button>
  )
}
