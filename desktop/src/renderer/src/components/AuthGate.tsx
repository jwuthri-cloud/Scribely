import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'

export interface AuthGateProps {
  onSignedIn: () => void
  onSkip: () => void
}

export function AuthGate({ onSignedIn, onSkip }: AuthGateProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI?.authStartSignIn()
      if (result && !result.success) {
        setError(result.error || 'Sign-in failed')
        setLoading(false)
      }
      // Success is handled via the onAuthStateChanged listener in Overlay
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed')
      setLoading(false)
    }
  }, [])

  const handleSkip = useCallback(async () => {
    await window.electronAPI?.authSkip()
    onSkip()
  }, [onSkip])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 flex flex-col items-center justify-center px-8 py-12"
    >
      {/* Logo */}
      <div className="mb-2">
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>

      <h1
        className="text-lg font-semibold mb-1"
        style={{ color: 'var(--text)' }}
      >
        Welcome to Scribely
      </h1>
      <p
        className="text-[13px] text-center mb-8 max-w-[280px] leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        Sign in to sync your meetings and transcripts across devices.
      </p>

      {/* Google sign-in button */}
      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full max-w-[260px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--accent)',
          color: '#fff',
        }}
      >
        {loading ? (
          <div
            className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
          />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        )}
        {loading ? 'Opening browser...' : 'Continue with Google'}
      </button>

      {/* Error message */}
      {error && (
        <p
          className="mt-3 text-[12px] text-center max-w-[260px]"
          style={{ color: 'var(--error, #ef4444)' }}
        >
          {error}
        </p>
      )}

      {/* Skip button */}
      <button
        onClick={handleSkip}
        disabled={loading}
        className="mt-4 text-[12px] transition-colors hover:underline disabled:opacity-50"
        style={{ color: 'var(--text-muted)' }}
      >
        Skip for now
      </button>
    </motion.div>
  )
}
