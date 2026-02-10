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
  // Cloned streams used for PCM extraction — must be stopped on cleanup
  const micCloneRef = useRef<MediaStream | null>(null)
  const tabCloneRef = useRef<MediaStream | null>(null)

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
      // Clone the stream for PCM extraction so the original stays available
      // for the MediaRecorder in useMeetingRecorder
      const clonedMicStream = new MediaStream(stream.getAudioTracks().map((t) => t.clone()))
      micCloneRef.current = clonedMicStream
      const { ctx, processor } = await createPcmExtractor(clonedMicStream, 'mic')
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
  const setupTabCapture = useCallback(async (): Promise<MediaStream | null> => {
    try {
      // Keep constraints minimal for maximum Electron/Chromium compatibility.
      // Some advanced display-audio hints can cause immediate rejections on
      // certain versions and surface as "cancelled or denied".
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })

      tabStreamRef.current = stream

      const audioTracks = stream.getAudioTracks()
      const videoTracks = stream.getVideoTracks()
      console.log(
        `[audio-capture] Display media: ${audioTracks.length} audio, ${videoTracks.length} video`,
      )

      const bindStreamEnded = (activeStream: MediaStream) => {
        activeStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setTabActive(false)
        })
      }

      if (audioTracks.length === 0) {
        const surface =
          videoTracks[0]?.getSettings?.().displaySurface || 'unknown'
        console.warn(
          `[audio-capture] No audio tracks for surface=${surface}. ` +
            'Window/app capture on macOS often lacks system audio — mic will still work.',
        )
        // Don't retry / show a second picker. Video-only capture is fine;
        // the mic stream provides user audio for transcription.
      }

      bindStreamEnded(stream)
      setTabActive(true)

      // Set up PCM extraction only when system audio is available
      if (audioTracks.length > 0) {
        const settings = audioTracks[0].getSettings()
        console.log('[audio-capture] Audio track settings:', JSON.stringify(settings))

        // Clone audio tracks for PCM extraction so the originals stay available
        // for the MediaRecorder in useMeetingRecorder. Without cloning, connecting
        // the track to a second AudioContext can starve the original of data.
        const clonedAudioTracks = audioTracks.map((t) => t.clone())
        const audioOnly = new MediaStream(clonedAudioTracks)
        tabCloneRef.current = audioOnly
        const { ctx, processor } = await createPcmExtractor(audioOnly, 'system')
        tabContextRef.current = ctx
        tabProcessorRef.current = processor
      }

      return stream
    } catch (err) {
      console.error('[audio-capture] Tab capture error:', err)
      const message =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : 'unknown'
      if (message === 'NotAllowedError') {
        setError(
          'Screen capture permission denied. Enable "Electron" in macOS Privacy > Screen & System Audio Recording, then restart app.',
        )
      } else if (message === 'NotSupportedError') {
        setError(
          'Screen capture not supported in current mode. Restart app and try again.',
        )
      } else {
        setError(`Screen capture failed (${message}). Please retry and allow sharing.`)
      }
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

    // Stop all media tracks (originals + clones used for PCM extraction)
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    tabStreamRef.current?.getTracks().forEach((t) => t.stop())
    micCloneRef.current?.getTracks().forEach((t) => t.stop())
    tabCloneRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    tabStreamRef.current = null
    micCloneRef.current = null
    tabCloneRef.current = null

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
      micCloneRef.current?.getTracks().forEach((t) => t.stop())
      tabCloneRef.current?.getTracks().forEach((t) => t.stop())
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
