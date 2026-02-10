import { useState, useRef, useCallback, useEffect } from 'react'

const TARGET_SAMPLE_RATE = 16000

/**
 * Dual-stream audio capture hook.
 * Captures mic (local user) and tab/window (remote audio) as separate streams.
 *
 * Phase 2: Streams each ScriptProcessorNode frame (~256ms at 4096 buffer / 16kHz)
 * directly to the main process via fire-and-forget IPC. The main process handles
 * VAD segmentation and transcription. Falls back to the old chunk-based approach
 * if streamAudioFrame is not available.
 */
export function useAudioCapture() {
  const [isCapturing, setIsCapturing] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [tabActive, setTabActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const micStreamRef = useRef<MediaStream | null>(null)
  const tabStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const tabContextRef = useRef<AudioContext | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const tabProcessorRef = useRef<ScriptProcessorNode | null>(null)

  // ── Stream a single audio frame to main process ────────
  const streamFrame = useCallback(
    (input: Float32Array, source: 'mic' | 'system') => {
      const copy = new Float32Array(input.length)
      copy.set(input)

      // Use the streaming IPC (fire-and-forget, processed by VAD in main)
      try {
        window.electronAPI?.streamAudioFrame({
          source,
          pcm: copy.buffer,
          sampleRate: TARGET_SAMPLE_RATE,
          timestamp: Date.now(),
        })
      } catch (err) {
        console.error(`[audio-capture] Failed to stream ${source} frame:`, err)
      }
    },
    [],
  )

  // ── Set up a PCM extractor on a MediaStream ──────────
  const createPcmExtractor = useCallback(
    async (
      stream: MediaStream,
      source: 'mic' | 'system',
    ): Promise<{ ctx: AudioContext; processor: ScriptProcessorNode }> => {
      let ctx: AudioContext
      try {
        ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      } catch {
        ctx = new AudioContext()
      }

      // AudioContext can start suspended (especially with Bluetooth devices
      // like AirPods). Explicitly resume to ensure processing runs.
      if (ctx.state === 'suspended') {
        console.log(`[audio-capture] AudioContext suspended for ${source}, resuming…`)
        await ctx.resume()
      }

      const audioSource = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)

      // Route through a zero-gain node to prevent playback
      const silencer = ctx.createGain()
      silencer.gain.value = 0

      // Stream each frame directly to the main process (Phase 2 VAD pipeline)
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        streamFrame(input, source)
      }

      audioSource.connect(processor)
      processor.connect(silencer)
      silencer.connect(ctx.destination)

      console.log(
        `[audio-capture] Streaming extractor ready for ${source} (rate=${ctx.sampleRate}, state=${ctx.state})`,
      )

      return { ctx, processor }
    },
    [streamFrame],
  )

  // ── Start mic capture ────────────────────────────────
  const setupMicCapture = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      micStreamRef.current = stream
      const { ctx, processor } = await createPcmExtractor(stream, 'mic')
      micContextRef.current = ctx
      micProcessorRef.current = processor
      setMicActive(true)
      return stream
    } catch (err) {
      console.error('[audio-capture] Mic error:', err)
      setError('Microphone access denied')
      return null
    }
  }, [createPcmExtractor])

  // ── Start tab/window capture via getDisplayMedia ─────
  // The main process handler auto-selects the primary screen with
  // loopback audio, so this call always returns both video + audio.
  const setupTabCapture = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      })

      tabStreamRef.current = stream

      const audioTracks = stream.getAudioTracks()
      const videoTracks = stream.getVideoTracks()
      console.log(
        `[audio-capture] Display media: ${audioTracks.length} audio, ${videoTracks.length} video`,
      )

      if (audioTracks.length === 0) {
        console.warn('[audio-capture] No audio tracks — system audio capture may not be permitted')
        setError('No system audio captured. Grant screen recording permission in System Settings.')
        return stream
      }

      // Log track details for debugging
      const settings = audioTracks[0].getSettings()
      console.log('[audio-capture] Audio track settings:', JSON.stringify(settings))

      // Extract audio for PCM processing
      const audioOnly = new MediaStream(audioTracks)
      const { ctx, processor } = await createPcmExtractor(audioOnly, 'system')
      tabContextRef.current = ctx
      tabProcessorRef.current = processor

      // Handle stream ending (user stops sharing)
      videoTracks[0]?.addEventListener('ended', () => {
        setTabActive(false)
      })

      setTabActive(true)
      return stream
    } catch (err) {
      console.error('[audio-capture] Tab capture error:', err)
      setError('Screen capture was cancelled or denied')
      return null
    }
  }, [createPcmExtractor])

  // ── Public: start capture (tab + mic) ────────────────
  const startCapture = useCallback(
    async (options: { mic: boolean; tab: boolean }) => {
      setError(null)

      let micStream: MediaStream | null = null
      let tabStream: MediaStream | null = null

      // Start mic FIRST — getDisplayMedia can lock the audio device,
      // causing getUserMedia to fail with "access denied" if called after.
      if (options.mic) {
        micStream = await setupMicCapture()
      }

      if (options.tab) {
        tabStream = await setupTabCapture()
      }

      if (!micStream && !tabStream) {
        setError('No audio source available')
        return { micStream: null, tabStream: null }
      }

      setIsCapturing(true)
      return { micStream, tabStream }
    },
    [setupMicCapture, setupTabCapture],
  )

  // ── Public: stop capture ─────────────────────────────
  const stopCapture = useCallback(() => {
    // Disconnect processors
    micProcessorRef.current?.disconnect()
    tabProcessorRef.current?.disconnect()
    micProcessorRef.current = null
    tabProcessorRef.current = null

    // Close audio contexts
    micContextRef.current?.close()
    tabContextRef.current?.close()
    micContextRef.current = null
    tabContextRef.current = null

    // Stop all media tracks
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    tabStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    tabStreamRef.current = null

    setIsCapturing(false)
    setMicActive(false)
    setTabActive(false)
    setError(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      micProcessorRef.current?.disconnect()
      tabProcessorRef.current?.disconnect()
      micContextRef.current?.close()
      tabContextRef.current?.close()
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      tabStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return {
    isCapturing,
    micActive,
    tabActive,
    error,
    startCapture,
    stopCapture,
    getMicStream: () => micStreamRef.current,
    getTabStream: () => tabStreamRef.current,
  }
}
