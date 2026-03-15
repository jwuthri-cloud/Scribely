import { useEffect, useState, useCallback } from 'react'
import type { UploadQueueItem, UploadStatus } from '../types'

// ── Helpers ────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Status badge ───────────────────────────────────────────────

function StatusBadge({ status }: { status: UploadStatus }) {
  const configs: Record<UploadStatus, { label: string; color: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Pending',
      color: 'var(--text-muted)',
      icon: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
    },
    uploading: {
      label: 'Uploading…',
      color: 'var(--accent)',
      icon: (
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className="animate-spin"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ),
    },
    success: {
      label: 'Synced',
      color: 'var(--success)',
      icon: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ),
    },
    failed: {
      label: 'Failed',
      color: 'var(--error)',
      icon: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      ),
    },
  }

  const { label, color, icon } = configs[status]

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {icon}
      {label}
    </span>
  )
}

// ── Single item card ───────────────────────────────────────────

function SyncItem({
  item,
  onRetry,
  onClear,
}: {
  item: UploadQueueItem
  onRetry: (id: string) => void
  onClear: (id: string) => void
}) {
  const canRetry = item.status === 'failed' || item.status === 'pending'

  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Top row: name + time + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="text-[12px] font-medium leading-tight truncate"
            style={{ color: 'var(--text)' }}
            title={item.displayName}
          >
            {item.displayName}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {relativeTime(item.createdAt)}
            {item.hasRecording && (
              <span className="ml-1.5 opacity-70">· with recording</span>
            )}
            {item.attemptCount > 0 && item.status !== 'success' && (
              <span className="ml-1.5 opacity-70">· {item.attemptCount} attempt{item.attemptCount > 1 ? 's' : ''}</span>
            )}
          </span>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* Error message */}
      {item.error && (
        <p
          className="text-[10px] leading-snug px-2 py-1.5 rounded-lg"
          style={{
            color: 'var(--error)',
            backgroundColor: 'color-mix(in srgb, var(--error) 8%, transparent)',
          }}
        >
          {item.error}
        </p>
      )}

      {/* meetingId on success */}
      {item.meetingId && item.status === 'success' && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          ID: <span className="font-mono opacity-70">{item.meetingId}</span>
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-0.5">
        {canRetry && (
          <button
            onClick={() => onRetry(item.id)}
            disabled={item.status === 'uploading'}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.59" />
            </svg>
            Retry
          </button>
        )}
        <button
          onClick={() => onClear(item.id)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────

export function MeetingSyncHistoryView() {
  const [items, setItems] = useState<UploadQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)

  const loadHistory = useCallback(async () => {
    const history = await window.electronAPI?.uploadQueueGetHistory?.()
    if (history) setItems(history as UploadQueueItem[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadHistory()
    const unsub = window.electronAPI?.onUploadQueueChanged?.((updated) => {
      setItems(updated as UploadQueueItem[])
    })
    return () => unsub?.()
  }, [loadHistory])

  useEffect(() => {
    const unsubExpired = window.electronAPI?.onAuthTokenExpired?.(() => setTokenExpired(true))
    const unsubAuth = window.electronAPI?.onAuthStateChanged?.((state) => {
      if (state.mode === 'authenticated') setTokenExpired(false)
    })
    return () => {
      unsubExpired?.()
      unsubAuth?.()
    }
  }, [])

  const handleRetry = useCallback(async (id: string) => {
    setRetrying(id)
    await window.electronAPI?.uploadQueueRetryItem?.(id)
    setRetrying(null)
  }, [])

  const handleClear = useCallback(async (id: string) => {
    await window.electronAPI?.uploadQueueClearItem?.(id)
  }, [])

  const handleClearAll = useCallback(async () => {
    await window.electronAPI?.uploadQueueClearAll?.()
  }, [])

  const handleRetryAll = useCallback(async () => {
    const failed = items.filter((i) => i.status === 'failed' || i.status === 'pending')
    for (const item of failed) {
      await window.electronAPI?.uploadQueueRetryItem?.(item.id)
    }
  }, [items])

  const failedCount = items.filter((i) => i.status === 'failed').length
  const pendingCount = items.filter((i) => i.status === 'pending' || i.status === 'uploading').length
  const successCount = items.filter((i) => i.status === 'success').length
  const hasAuthFailure = items.some(
    (i) =>
      i.status === 'failed' &&
      (i.error?.includes('401') || i.error?.includes('Authentication failed')),
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            Meeting Sync
          </h2>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {items.length === 0
              ? 'No meetings synced yet'
              : `${successCount} synced · ${pendingCount} uploading · ${failedCount} failed`}
          </p>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-1.5">
            {failedCount > 0 && (
              <button
                onClick={handleRetryAll}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:brightness-110"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 1 0 .49-3.59" />
                </svg>
                Retry all
              </button>
            )}
            <button
              onClick={handleClearAll}
              className="px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-muted)' }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Token expired banner */}
      {(tokenExpired || hasAuthFailure) && (
        <div
          className="mx-3 mt-3 px-3 py-2.5 rounded-xl flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--error) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)',
          }}
        >
          <p className="text-[11px]" style={{ color: 'var(--error)' }}>
            Session expired. Sign in again to retry uploads.
          </p>
          <button
            onClick={() => window.electronAPI?.authStartSignIn?.()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium shrink-0"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in again
          </button>
        </div>
      )}

      {/* Item list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin w-4 h-4"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--text-muted)' }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-[11px] text-center max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
              Meetings will appear here after they end
            </p>
          </div>
        ) : (
          items.map((item) => (
            <SyncItem
              key={item.id}
              item={retrying === item.id ? { ...item, status: 'uploading' } : item}
              onRetry={handleRetry}
              onClear={handleClear}
            />
          ))
        )}
      </div>
    </div>
  )
}
