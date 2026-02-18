import { useEffect, useState, useCallback } from 'react'

const TOTAL_STEPS = 5

// ── Section layout helper (matches SettingsView / LLMView) ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      <div
        className="rounded-xl p-3 border"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function openUrl(url: string) {
  window.electronAPI?.openExternalUrl?.(url)
}

export interface OnboardingViewProps {
  onComplete: () => void
}

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const [step, setStep] = useState(1)

  // ── Step 1: API Key ────────────────────────────────────
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    window.electronAPI?.llmHasApiKey?.().then(setHasApiKey)
  }, [])

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return
    setApiKeyStatus('saving')
    try {
      const result = await window.electronAPI?.llmSetApiKey(apiKeyInput.trim())
      if (result?.success) {
        setHasApiKey(true)
        setApiKeyStatus('saved')
        setApiKeyInput('')
        setTimeout(() => setApiKeyStatus('idle'), 2000)
      } else {
        setApiKeyStatus('error')
        setTimeout(() => setApiKeyStatus('idle'), 2000)
      }
    } catch {
      setApiKeyStatus('error')
      setTimeout(() => setApiKeyStatus('idle'), 2000)
    }
  }, [apiKeyInput])

  const canProceedFromStep1 = hasApiKey

  // ── Step 2: Whisper Model ───────────────────────────────
  const [modelStatus, setModelStatus] = useState<{
    available: boolean
    downloading: boolean
    progress: number
  } | null>(null)

  useEffect(() => {
    window.electronAPI?.getModelStatus?.().then((s: any) => {
      setModelStatus(s?.whisperModel || null)
    })
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI?.onModelProgress?.((data) => {
      setModelStatus((prev) => ({
        available: prev?.available || false,
        downloading: true,
        progress: Math.max(prev?.progress || 0, data.progress),
      }))
    })
    const unsub2 = window.electronAPI?.onModelComplete?.(() => {
      setModelStatus({ available: true, downloading: false, progress: 100 })
    })
    return () => {
      unsub?.()
      unsub2?.()
    }
  }, [])

  const handleDownloadWhisper = useCallback(() => {
    window.electronAPI?.downloadWhisperModel?.()
  }, [])

  // ── Step 3: Chrome Extension ────────────────────────────
  const [extensionConnected, setExtensionConnected] = useState(false)
  const [extensionChecking, setExtensionChecking] = useState(false)

  useEffect(() => {
    window.electronAPI?.getExtensionStatus?.().then((s) => {
      if (s) setExtensionConnected(s.connected)
    })
    const unsub = window.electronAPI?.onExtensionStatusChanged?.((s) => {
      setExtensionConnected(s.connected)
    })
    return () => unsub?.()
  }, [])

  const checkExtensionConnection = useCallback(async () => {
    setExtensionChecking(true)
    const status = await window.electronAPI?.getExtensionStatus?.()
    setExtensionConnected(status?.connected ?? false)
    setExtensionChecking(false)
  }, [])

  // ── Step 4: Permissions ─────────────────────────────────
  const [micGranted, setMicGranted] = useState<boolean | null>(null)
  const [clipboardTested, setClipboardTested] = useState(false)

  const testMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMicGranted(true)
      return true
    } catch {
      setMicGranted(false)
      return false
    }
  }, [])

  useEffect(() => {
    navigator.permissions?.query({ name: 'microphone' }).then((result) => {
      setMicGranted(result.state === 'granted')
      result.addEventListener('change', () => {
        setMicGranted(result.state === 'granted')
      })
    }).catch(() => {
      // Permissions API not available
    })
  }, [])

  const openScreenRecordingSettings = useCallback(() => {
    openUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  }, [])

  const openAccessibilitySettings = useCallback(() => {
    openUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }, [])

  const testClipboard = useCallback(async () => {
    const sample = 'Scribely clipboard test — copy works!'
    await window.electronAPI?.clipboardWriteText?.(sample)
    setClipboardTested(true)
    setTimeout(() => setClipboardTested(false), 2000)
  }, [])

  // ── Completion ───────────────────────────────────────────
  const handleSkip = useCallback(async () => {
    await window.electronAPI?.onboardingSetCompleted?.(true)
    onComplete()
  }, [onComplete])

  const handleFinish = useCallback(async () => {
    await window.electronAPI?.onboardingSetCompleted?.(true)
    onComplete()
  }, [onComplete])

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1)
    }
  }, [step])

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep(step - 1)
    }
  }, [step])

  // ── Load hotkey for Done step ────────────────────────────
  const [toggleHotkey, setToggleHotkey] = useState('Alt+T')
  useEffect(() => {
    window.electronAPI?.getSettings?.().then((s) => {
      if (s?.hotkeys?.toggleOverlay) {
        setToggleHotkey(s.hotkeys.toggleOverlay)
      }
    })
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="shrink-0 px-4 pt-3">
        <div className="flex gap-1">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: i + 1 <= step ? 'var(--accent)' : 'var(--border)',
                opacity: i + 1 <= step ? 1 : 0.4,
              }}
            />
          ))}
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Step {step} of {TOTAL_STEPS}
        </p>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {step === 1 && (
          <>
            <Section title="OpenAI API Key">
              <div className="space-y-2">
                {hasApiKey ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: 'var(--success)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--text)' }}>
                        API key configured
                      </span>
                    </div>
                    <button
                      onClick={() => setHasApiKey(false)}
                      className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                        placeholder="sk-..."
                        className="flex-1 bg-transparent outline-none text-xs px-2.5 py-1.5 rounded-lg border transition-colors focus:border-[var(--accent)]"
                        style={{
                          color: 'var(--text)',
                          borderColor: 'var(--input-border)',
                          backgroundColor: 'var(--input-bg)',
                        }}
                      />
                      <button
                        onClick={handleSaveApiKey}
                        disabled={!apiKeyInput.trim() || apiKeyStatus === 'saving'}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 disabled:opacity-40"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: '#fff',
                        }}
                      >
                        {apiKeyStatus === 'saving' ? '...' : 'Save'}
                      </button>
                    </div>
                    {apiKeyStatus === 'error' && (
                      <span className="text-[10px]" style={{ color: 'var(--error)' }}>
                        Failed to save key. Check format.
                      </span>
                    )}
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Get your key at{' '}
                      <button
                        type="button"
                        onClick={() => openUrl('https://platform.openai.com/api-keys')}
                        className="underline hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        platform.openai.com
                      </button>
                      . Stored locally, never sent except to OpenAI.
                    </p>
                  </div>
                )}
              </div>
            </Section>
          </>
        )}

        {step === 2 && (
          <>
            <Section title="Whisper Model (Transcription)">
              <div className="space-y-3">
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Download the Whisper model for local meeting transcription. You can skip if you
                  only use the Chrome extension.
                </p>
                {modelStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {modelStatus.downloading
                        ? `Downloading... ${modelStatus.progress}%`
                        : modelStatus.available
                          ? 'Model ready'
                          : 'Model not downloaded'}
                    </span>
                    {modelStatus.downloading && (
                      <div
                        className="w-20 h-1 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--border)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            backgroundColor: 'var(--accent)',
                            width: `${modelStatus.progress}%`,
                          }}
                        />
                      </div>
                    )}
                    {!modelStatus.downloading && !modelStatus.available && (
                      <button
                        onClick={handleDownloadWhisper}
                        className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                        style={{
                          borderColor: 'var(--accent)',
                          color: 'var(--accent)',
                        }}
                      >
                        Download
                      </button>
                    )}
                    {modelStatus.available && !modelStatus.downloading && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-md"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--success) 15%, transparent)',
                          color: 'var(--success)',
                        }}
                      >
                        Ready
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Section>
          </>
        )}

        {step === 3 && (
          <>
            <Section title="Chrome Extension">
              <div className="space-y-3">
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  For meeting transcription from Google Meet, Zoom, etc., install the Scribely Tab
                  Capture extension. It streams tab audio to the desktop app.
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Once installed, open a meeting tab, click the extension icon, then "Start Sharing".
                  Status will show Connected when the extension is actively streaming.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Extension status:
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                    style={{
                      backgroundColor: extensionConnected
                        ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                        : 'color-mix(in srgb, var(--text-muted) 15%, transparent)',
                      color: extensionConnected ? 'var(--success)' : 'var(--text-muted)',
                    }}
                  >
                    {extensionConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => checkExtensionConnection()}
                    disabled={extensionChecking}
                    className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:brightness-110"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    {extensionChecking ? 'Checking...' : 'Refresh status'}
                  </button>
                  <button
                    onClick={() =>
                      openUrl(
                        'https://github.com/julienwuthrich/scribely/tree/main/chrome-extension',
                      )
                    }
                    className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:brightness-110"
                    style={{
                      borderColor: 'var(--accent)',
                      color: 'var(--accent)',
                    }}
                  >
                    Install instructions
                  </button>
                </div>
              </div>
            </Section>
          </>
        )}

        {step === 4 && (
          <>
            <Section title="Permissions">
              <div className="space-y-3">
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Ensure these permissions are granted for full functionality:
                </p>
                <ul className="space-y-2 text-[11px]">
                  <li className="flex items-center gap-2">
                    {micGranted ? (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
                    ) : (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
                    )}
                    <span style={{ color: 'var(--text)' }}>Microphone</span>
                    {!micGranted && (
                      <button
                        onClick={testMicrophone}
                        className="text-[10px] px-1.5 py-0.5 rounded border"
                        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      >
                        Test
                      </button>
                    )}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text)' }}>Screen recording</span>
                    <button
                      onClick={openScreenRecordingSettings}
                      className="text-[10px] px-1.5 py-0.5 rounded border"
                      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    >
                      Open Settings
                    </button>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text)' }}>Accessibility (for hotkeys)</span>
                    <button
                      onClick={openAccessibilitySettings}
                      className="text-[10px] px-1.5 py-0.5 rounded border"
                      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    >
                      Open Settings
                    </button>
                  </li>
                  <li className="flex items-center gap-2">
                    {clipboardTested ? (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
                    ) : (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
                    )}
                    <span style={{ color: 'var(--text)' }}>Clipboard (copy code & responses)</span>
                    <button
                      onClick={testClipboard}
                      className="text-[10px] px-1.5 py-0.5 rounded border"
                      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    >
                      {clipboardTested ? 'Copied!' : 'Test copy'}
                    </button>
                  </li>
                </ul>
              </div>
            </Section>
          </>
        )}

        {step === 5 && (
          <>
            <Section title="You're all set">
              <div className="space-y-3">
                <p className="text-[11px]" style={{ color: 'var(--text)' }}>
                  Use <kbd className="px-1 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', border: '1px solid' }}>{toggleHotkey}</kbd> to toggle the overlay.
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  You can configure hotkeys, themes, and more in Settings.
                </p>
              </div>
            </Section>
          </>
        )}
      </div>

      {/* Footer: Skip / Back / Next / Finish */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div>
          {step === 1 ? (
            <button
              onClick={handleSkip}
              className="text-[11px] transition-colors hover:brightness-125"
              style={{ color: 'var(--text-muted)' }}
            >
              I'll do this later
            </button>
          ) : (
            <button
              onClick={handleBack}
              className="text-[11px] transition-colors hover:brightness-125"
              style={{ color: 'var(--text-muted)' }}
            >
              Back
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {step < TOTAL_STEPS ? (
            <>
              <button
                onClick={handleSkip}
                className="px-3 py-1.5 rounded-lg text-[11px] border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                disabled={step === 1 && !canProceedFromStep1}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                }}
              >
                Next
              </button>
            </>
          ) : (
            <button
              onClick={handleFinish}
              className="px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150"
              style={{
                backgroundColor: 'var(--accent)',
                color: '#fff',
              }}
            >
              Go to chat
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
