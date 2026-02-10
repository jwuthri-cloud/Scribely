import { useState, useRef, useCallback } from 'react'

interface RecorderState {
  isRecording: boolean
  duration: number
  error: string | null
}

/**
 * Records the meeting as a WebM video file.
 * Merges tab video + tab audio + mic audio into a single recording.
 */
export function useMeetingRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const mixerCtxRef = useRef<AudioContext | null>(null)
  const hasLiveAudioTrack = useCallback((stream?: MediaStream | null): boolean => {
    if (!stream) return false
    return stream.getAudioTracks().some((track) => track.readyState === 'live')
  }, [])

  const startRecording = useCallback(
    async (tabStream: MediaStream, micStream?: MediaStream | null) => {
      try {
        let combinedStream: MediaStream

        if (tabStream && micStream) {
          // Merge tab audio + mic audio, keep tab video
          const audioCtx = new AudioContext()
          mixerCtxRef.current = audioCtx
          if (audioCtx.state === 'suspended') {
            console.log('[recorder] AudioContext suspended, resuming…')
            await audioCtx.resume()
          }
          console.log(`[recorder] AudioContext state=${audioCtx.state} rate=${audioCtx.sampleRate}`)

          const tabAudioTracks = tabStream
            .getAudioTracks()
            .filter((track) => track.readyState === 'live')
          const micAudioTracks = micStream
            .getAudioTracks()
            .filter((track) => track.readyState === 'live')
          const dest = audioCtx.createMediaStreamDestination()

          if (tabAudioTracks.length > 0) {
            const tabAudio = audioCtx.createMediaStreamSource(
              new MediaStream(tabAudioTracks),
            )
            tabAudio.connect(dest)
          }

          if (micAudioTracks.length > 0) {
            const micAudio = audioCtx.createMediaStreamSource(
              new MediaStream(micAudioTracks),
            )
            micAudio.connect(dest)
          }

          const videoTracks = tabStream
            .getVideoTracks()
            .filter((track) => track.readyState === 'live')
          const mixedAudioTracks = dest.stream
            .getAudioTracks()
            .filter((track) => track.readyState === 'live')

          // Tab video + mixed audio
          combinedStream = new MediaStream([...videoTracks, ...mixedAudioTracks])

          if (mixedAudioTracks.length === 0) {
            console.warn('[recorder] Started video recording without audio tracks')
          }
        } else if (tabStream) {
          if (!hasLiveAudioTrack(tabStream)) {
            console.warn('[recorder] Tab stream has no live audio track')
          }
          combinedStream = tabStream
        } else if (micStream) {
          combinedStream = micStream
        } else {
          setState((prev) => ({ ...prev, error: 'No streams to record' }))
          return
        }

        if (combinedStream.getTracks().length === 0) {
          setState((prev) => ({ ...prev, error: 'No active tracks to record' }))
          return
        }

        // Pick the best available mime type
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm'

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 2_500_000,
        })

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data)
          }
        }

        recorder.start(1000) // 1-second chunks
        mediaRecorderRef.current = recorder
        startTimeRef.current = Date.now()

        // Duration timer
        timerRef.current = setInterval(() => {
          setState((prev) => ({
            ...prev,
            duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }))
        }, 1000)

        setState({ isRecording: true, duration: 0, error: null })
      } catch (err) {
        console.error('[recorder] Failed to start:', err)
        setState((prev) => ({ ...prev, error: 'Failed to start recording' }))
      }
    },
    [hasLiveAudioTrack],
  )

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        setState((prev) => ({ ...prev, isRecording: false }))
        resolve(null)
        return
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        chunksRef.current = []

        // Close the mixer context
        mixerCtxRef.current?.close()
        mixerCtxRef.current = null

        // Save to disk via main process
        try {
          const arrayBuffer = await blob.arrayBuffer()
          const result = await window.electronAPI?.saveMeetingRecording?.({
            data: arrayBuffer,
            mimeType: 'video/webm',
          })
          setState({ isRecording: false, duration: 0, error: null })
          resolve(result?.filepath || null)
        } catch (err) {
          console.error('[recorder] Failed to save:', err)
          setState((prev) => ({
            ...prev,
            isRecording: false,
            error: 'Failed to save recording',
          }))
          resolve(null)
        }
      }

      recorder.stop()
      mediaRecorderRef.current = null
    })
  }, [])

  const formatDuration = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
  }, [])

  return {
    ...state,
    formattedDuration: formatDuration(state.duration),
    startRecording,
    stopRecording,
  }
}
