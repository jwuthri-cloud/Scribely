"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  DEMO_TRANSCRIPT_ENTRIES,
  DEMO_AUTO_QUESTION,
  DEMO_AUTO_RESPONSE,
  DEMO_CANNED_RESPONSES,
  type DemoTranscriptEntry,
  type DemoChatMessage,
} from "./demo-data"

interface DemoScriptState {
  transcriptEntries: DemoTranscriptEntry[]
  chatMessages: DemoChatMessage[]
  isStreaming: boolean
  meetingTimerSec: number
  scriptPhase: "transcript" | "question" | "streaming" | "idle"
  inputDisabled: boolean
}

const TRANSCRIPT_DELAYS = [500, 2000, 3500, 5000, 6500]
const QUESTION_DELAY = 8000
const STREAM_START_DELAY = 9000
const STREAM_CHAR_INTERVAL = 18

export function useDemoScript(isVisible: boolean) {
  const [state, setState] = useState<DemoScriptState>({
    transcriptEntries: [],
    chatMessages: [],
    isStreaming: false,
    meetingTimerSec: 90,
    scriptPhase: "transcript",
    inputDisabled: true,
  })

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasStartedRef = useRef(false)
  const streamCharIndexRef = useRef(0)

  const cleanup = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current)
      streamIntervalRef.current = null
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }, [])

  const streamResponse = useCallback((response: string, onComplete?: () => void) => {
    streamCharIndexRef.current = 0
    setState((s) => ({
      ...s,
      isStreaming: true,
      chatMessages: [...s.chatMessages, { role: "assistant", content: "" }],
    }))

    streamIntervalRef.current = setInterval(() => {
      streamCharIndexRef.current++
      const charIndex = streamCharIndexRef.current

      if (charIndex >= response.length) {
        if (streamIntervalRef.current) {
          clearInterval(streamIntervalRef.current)
          streamIntervalRef.current = null
        }
        setState((s) => {
          const msgs = [...s.chatMessages]
          msgs[msgs.length - 1] = { role: "assistant", content: response }
          return {
            ...s,
            chatMessages: msgs,
            isStreaming: false,
            scriptPhase: "idle",
            inputDisabled: false,
          }
        })
        onComplete?.()
        return
      }

      setState((s) => {
        const msgs = [...s.chatMessages]
        msgs[msgs.length - 1] = {
          role: "assistant",
          content: response.slice(0, charIndex),
        }
        return { ...s, chatMessages: msgs }
      })
    }, STREAM_CHAR_INTERVAL)
  }, [])

  // Main script orchestration
  useEffect(() => {
    if (!isVisible || hasStartedRef.current) return
    hasStartedRef.current = true

    // Meeting timer
    timerIntervalRef.current = setInterval(() => {
      setState((s) => ({ ...s, meetingTimerSec: s.meetingTimerSec + 1 }))
    }, 1000)

    // Transcript entries appear one by one
    DEMO_TRANSCRIPT_ENTRIES.forEach((entry, i) => {
      const timer = setTimeout(() => {
        setState((s) => ({
          ...s,
          transcriptEntries: [...s.transcriptEntries, entry],
        }))
      }, TRANSCRIPT_DELAYS[i] ?? TRANSCRIPT_DELAYS[TRANSCRIPT_DELAYS.length - 1]! + (i - TRANSCRIPT_DELAYS.length + 1) * 1500)
      timersRef.current.push(timer)
    })

    // Auto question
    const questionTimer = setTimeout(() => {
      setState((s) => ({
        ...s,
        scriptPhase: "question",
        chatMessages: [
          ...s.chatMessages,
          { role: "user", content: DEMO_AUTO_QUESTION },
        ],
      }))
    }, QUESTION_DELAY)
    timersRef.current.push(questionTimer)

    // Stream response
    const streamTimer = setTimeout(() => {
      setState((s) => ({ ...s, scriptPhase: "streaming" }))
      streamResponse(DEMO_AUTO_RESPONSE)
    }, STREAM_START_DELAY)
    timersRef.current.push(streamTimer)

    return cleanup
  }, [isVisible, streamResponse, cleanup])

  const handleUserMessage = useCallback(
    (message: string) => {
      if (state.isStreaming) return

      setState((s) => ({
        ...s,
        chatMessages: [...s.chatMessages, { role: "user", content: message }],
        inputDisabled: true,
      }))

      const response =
        DEMO_CANNED_RESPONSES[message] ?? DEMO_CANNED_RESPONSES.default!

      const timer = setTimeout(() => {
        streamResponse(response, () => {
          setState((s) => ({ ...s, inputDisabled: false }))
        })
      }, 500)
      timersRef.current.push(timer)
    },
    [state.isStreaming, streamResponse]
  )

  const handleChipAction = useCallback(
    (action: string) => {
      handleUserMessage(action)
    },
    [handleUserMessage]
  )

  const formattedTimer = (() => {
    const m = Math.floor(state.meetingTimerSec / 60)
    const s = state.meetingTimerSec % 60
    return `${m}:${String(s).padStart(2, "0")}`
  })()

  return {
    ...state,
    formattedTimer,
    handleUserMessage,
    handleChipAction,
  }
}
