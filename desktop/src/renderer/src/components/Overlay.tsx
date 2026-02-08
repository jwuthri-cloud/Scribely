import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TitleBar } from './TitleBar'
import { ResponseCard } from './ResponseCard'
import { ActionChips } from './ActionChips'
import { InputBar } from './InputBar'
import { SettingsView } from './SettingsView'
import { useChat } from '../hooks/useChat'
import { useWhisperSTT } from '../hooks/useWhisperSTT'
import type { ChatAttachment } from '../types'

export function Overlay() {
  const [visible, setVisible] = useState(true)
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null)
  const { messages, isLoading, sendMessage, resetChat, stopGeneration } = useChat()
  const stt = useWhisperSTT()

  // Toggle visibility from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onToggleVisibility((v) => {
      setVisible(v)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  // Screenshot from hotkey
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onScreenshotTaken((dataUrl) => {
      setPendingScreenshot(dataUrl)
      // Switch to chat view if in settings
      setView('chat')
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  // Audio toggle from hotkey
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onToggleAudio(() => {
      stt.toggleRecording()
    })
    return () => {
      unsubscribe?.()
    }
  }, [stt.toggleRecording])

  const handleSend = useCallback(
    (content: string, attachments?: ChatAttachment[]) => {
      sendMessage(content, attachments)
      // Clear pending screenshot after sending
      setPendingScreenshot(null)
    },
    [sendMessage],
  )

  const handleScreenshot = useCallback(async () => {
    try {
      const dataUrl = await window.electronAPI?.takeScreenshot()
      if (dataUrl) {
        setPendingScreenshot(dataUrl)
      }
    } catch (err) {
      console.error('Screenshot failed:', err)
    }
  }, [])

  const toggleView = useCallback(() => {
    setView((v) => (v === 'chat' ? 'settings' : 'chat'))
  }, [])

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass w-full h-screen flex flex-col rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--overlay)',
            borderColor: 'var(--border)',
          }}
        >
          <TitleBar view={view} onToggleView={toggleView} onReset={resetChat} />

          {/* Subtle separator */}
          <div
            className="mx-4 h-px shrink-0"
            style={{ backgroundColor: 'var(--border)', opacity: 0.5 }}
          />

          {view === 'chat' ? (
            <>
              <ResponseCard messages={messages} isLoading={isLoading} />
              <ActionChips onAction={(action) => handleSend(action)} />
              <InputBar
                onSend={handleSend}
                disabled={isLoading}
                isLoading={isLoading}
                onStop={stopGeneration}
                onScreenshot={handleScreenshot}
                pendingScreenshot={pendingScreenshot}
                onClearScreenshot={() => setPendingScreenshot(null)}
                isRecording={stt.isRecording}
                onToggleRecording={stt.toggleRecording}
                sttTranscript={stt.transcript}
                onClearTranscript={stt.clearTranscript}
              />
            </>
          ) : (
            <SettingsView />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
