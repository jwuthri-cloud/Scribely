import { useState, useRef, useCallback, useEffect } from 'react'

const CHUNK_INTERVAL_MS = 3000

/**
 * Speech-to-text using local whisper.cpp (via main process) or OpenAI cloud fallback.
 * Records mic in chunks, sends PCM to main process for transcription.
 */
export function useWhisperSTT() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const bufferRef = useRef<Float32Array[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Flush buffered PCM to main process for transcription
  const flushBuffer = useCallback(async () => {
    if (bufferRef.current.length === 0) return

    const chunks = bufferRef.current
    bufferRef.current = []

    // Merge chunks into a single Float32Array
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
    const merged = new Float32Array(totalLen)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    // Skip very short audio (< 0.3s at 16kHz)
    if (merged.length < 16000 * 0.3) return

    try {
      const result = await window.electronAPI?.transcribeAudioChunk?.({
        source: 'mic',
        pcm: merged.buffer,
        sampleRate: 16000,
        timestamp: Date.now(),
      })

      // result has { text, speaker, ... } if transcription succeeded
      const text =
        typeof result === 'object' && result !== null && 'text' in result
          ? (result as { text: string }).text
          : ''

      if (text?.trim()) {
        setTranscript((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()))
      }
    } catch (err) {
      console.error('[stt] Transcription failed:', err)
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Create AudioContext at 16kHz to match whisper's expected sample rate
      const ctx = new AudioContext({ sampleRate: 16000 })
      contextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const pcm = e.inputBuffer.getChannelData(0)
        bufferRef.current.push(new Float32Array(pcm))

        // Compute RMS for waveform visualization
        let sumSq = 0
        const step = Math.max(1, Math.floor(pcm.length / 256))
        let count = 0
        for (let i = 0; i < pcm.length; i += step) {
          sumSq += pcm[i] * pcm[i]
          count++
        }
        const rms = Math.sqrt(sumSq / count)
        setMicLevel(Math.min(1, rms * 5))
      }

      source.connect(processor)
      processor.connect(ctx.destination)

      setIsRecording(true)

      // Flush to whisper every CHUNK_INTERVAL_MS
      intervalRef.current = setInterval(flushBuffer, CHUNK_INTERVAL_MS)
    } catch (err) {
      setError('Microphone access denied')
      console.error('[stt] Mic error:', err)
    }
  }, [flushBuffer])

  const stopRecording = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Flush remaining audio
    flushBuffer()

    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (contextRef.current) {
      contextRef.current.close()
      contextRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    setIsRecording(false)
    setMicLevel(0)
  }, [flushBuffer])

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
      processorRef.current?.disconnect()
      contextRef.current?.close()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return {
    isRecording,
    transcript,
    error,
    micLevel,
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,
  }
}
