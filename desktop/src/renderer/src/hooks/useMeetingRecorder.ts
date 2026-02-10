import { useState, useRef, useCallback } from 'react'

interface RecorderState {
  isRecording: boolean
  duration: number
  error: string | null
  filepath: string | null
}

/**
 * Records the meeting as a WebM video file.
 * Writes chunks to disk incrementally every 5 seconds (not buffered in memory).
 */
export function useMeetingRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    duration: 0,
    error: null,
    filepath: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const mixerCtxRef = useRef<AudioContext | null>(null)
  const filepathRef = useRef<string | null>(null)

  const hasLiveAudioTrack = useCallback((stream?: MediaStream | null): boolean => {
    if (!stream) return false
    return stream.getAudioTracks().some((track) => track.readyState === 'live')
  }, [])

  const startRecording = useCallback(
    async (tabStream: MediaStream, micStream?: MediaStream | null) => {
      try {
        let combinedStream: MediaStream

        if (tabStream && micStream) {
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

        const allTracks = combinedStream.getTracks()
        console.log(`[recorder] Combined stream: ${allTracks.length} tracks (${allTracks.map(t => `${t.kind}:${t.readyState}`).join(', ')})`)

        if (allTracks.length === 0) {
          setState((prev) => ({ ...prev, error: 'No active tracks to record' }))
          return
        }

        // Pick the best available mime type based on tracks present
        const hasVideo = allTracks.some((t) => t.kind === 'video')
        const hasAudio = allTracks.some((t) => t.kind === 'audio')
        console.log(`[recorder] hasVideo=${hasVideo}, hasAudio=${hasAudio}`)

        let mimeType: string
        if (hasVideo && hasAudio) {
          mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
              ? 'video/webm;codecs=vp8,opus'
              : 'video/webm'
        } else if (hasVideo) {
          mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
              ? 'video/webm;codecs=vp8'
              : 'video/webm'
        } else {
          mimeType = 'audio/webm;codecs=opus'
        }
        console.log(`[recorder] Using mimeType: ${mimeType}`)

        // Initialize the file on disk first
        const fileResult = await window.electronAPI?.initRecordingFile?.({ mimeType })
        if (!fileResult?.filepath) {
          setState((prev) => ({ ...prev, error: 'Failed to create recording file' }))
          return
        }
        filepathRef.current = fileResult.filepath
        console.log(`[recorder] Incremental recording → ${fileResult.filepath}`)

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 2_500_000,
        })

        // Write each chunk directly to disk (no memory buffering)
        let chunkCount = 0
        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && filepathRef.current) {
            chunkCount++
            try {
              const buf = await e.data.arrayBuffer()
              console.log(`[recorder] Writing chunk #${chunkCount}: ${(buf.byteLength / 1024).toFixed(1)}KB`)
              await window.electronAPI?.appendRecordingChunk?.({
                filepath: filepathRef.current,
                data: buf,
              })
            } catch (err) {
              console.error('[recorder] Failed to write chunk:', err)
            }
          }
        }

        recorder.onerror = (e) => {
          console.error('[recorder] MediaRecorder error:', e)
        }

        // Request data every 5 seconds for incremental writes
        recorder.start(5000)
        mediaRecorderRef.current = recorder
        startTimeRef.current = Date.now()

        // Duration timer
        timerRef.current = setInterval(() => {
          setState((prev) => ({
            ...prev,
            duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }))
        }, 1000)

        setState({ isRecording: true, duration: 0, error: null, filepath: fileResult.filepath })
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
        const fp = filepathRef.current
        setState((prev) => ({ ...prev, isRecording: false }))
        resolve(fp)
        return
      }

      recorder.onstop = async () => {
        // Close the mixer context
        mixerCtxRef.current?.close()
        mixerCtxRef.current = null

        const fp = filepathRef.current
        console.log(`[recorder] Recording finalized: ${fp}`)
        setState({ isRecording: false, duration: 0, error: null, filepath: fp })
        filepathRef.current = null
        resolve(fp)
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
