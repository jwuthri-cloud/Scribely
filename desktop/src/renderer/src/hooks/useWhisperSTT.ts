import { useState, useRef, useCallback, useEffect } from 'react'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const CHUNK_INTERVAL_MS = 3000

/**
 * Real-time speech-to-text using the browser MediaRecorder + OpenAI Whisper API.
 * Records in chunks and transcribes each chunk for near-real-time results.
 */
export function useWhisperSTT() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const transcribeChunk = useCallback(async (blob: Blob) => {
    // Skip tiny/empty chunks
    if (blob.size < 1000) return

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY || ''
    if (!apiKey) {
      setError('No VITE_OPENAI_API_KEY set — STT disabled')
      return
    }

    const formData = new FormData()
    formData.append('file', blob, 'audio.webm')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'text')

    try {
      const res = await fetch(WHISPER_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      })

      if (!res.ok) {
        const msg = await res.text()
        console.error('[whisper] API error:', msg)
        return
      }

      const text = (await res.text()).trim()
      if (text) {
        setTranscript((prev) => (prev ? `${prev} ${text}` : text))
      }
    } catch (err) {
      console.error('[whisper] Transcription failed:', err)
    }
  }, [])

  const flushChunks = useCallback(() => {
    if (chunksRef.current.length === 0) return
    const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' })
    chunksRef.current = []
    transcribeChunk(blob)
  }, [transcribeChunk])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.start(500) // collect data every 500ms
      mediaRecorderRef.current = recorder
      setIsRecording(true)

      // Flush chunks to Whisper every CHUNK_INTERVAL_MS
      intervalRef.current = setInterval(flushChunks, CHUNK_INTERVAL_MS)
    } catch (err) {
      setError('Microphone access denied')
      console.error('[whisper] Mic error:', err)
    }
  }, [flushChunks])

  const stopRecording = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null

    // Transcribe any remaining chunks
    flushChunks()

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    setIsRecording(false)
  }, [flushChunks])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  const clearTranscript = useCallback(() => {
    setTranscript('')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  return {
    isRecording,
    transcript,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,
  }
}
