import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TitleBar } from './TitleBar'
import { ResponseCard } from './ResponseCard'
import { ActionChips } from './ActionChips'
import { InputBar } from './InputBar'
import { useChat } from '../hooks/useChat'

export function Overlay() {
  const [visible, setVisible] = useState(true)
  const { messages, isLoading, sendMessage } = useChat()

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onToggleVisibility((v) => {
      setVisible(v)
    })
    return () => {
      unsubscribe?.()
    }
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
          <TitleBar />

          {/* Subtle separator */}
          <div
            className="mx-4 h-px shrink-0"
            style={{ backgroundColor: 'var(--border)', opacity: 0.5 }}
          />

          <ResponseCard messages={messages} isLoading={isLoading} />
          <ActionChips onAction={(action) => sendMessage(action)} />
          <InputBar onSend={sendMessage} disabled={isLoading} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
