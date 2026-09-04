/**
 * Offscreen document for Scribely Tab Capture.
 *
 * This document runs in a hidden context and has access to:
 * - navigator.mediaDevices.getUserMedia (with tab capture stream ID)
 * - AudioWorklet (for PCM extraction)
 * - MediaRecorder (for WebM video)
 * - WebSocket (to stream data to the Electron app)
 *
 * Binary protocol (bidirectional with Electron WS server):
 *   0x01 + Float32Array → audio PCM frame (16kHz)           [offscreen → Electron]
 *   0x02 + Uint8Array   → video WebM chunk                  [offscreen → Electron]
 *   0x03 + JSON string   → control message                  [both directions]
 *   0x04 + Float32Array → mic PCM (16kHz, from Electron)    [Electron → offscreen]
 */

const MSG_AUDIO = 0x01
const MSG_VIDEO = 0x02
const MSG_CONTROL = 0x03
const MSG_MIC = 0x04

const TARGET_SAMPLE_RATE = 16000

let mediaStream = null
let micStream = null         // local mic MediaStream (direct capture if permission granted)
let audioContext = null      // 16kHz context for PCM extraction (high-quality Chrome resampler)
let playbackCtx = null       // native-rate context for low-latency audio playback
let mixerCtx = null          // native-rate context for mixing tab + mic audio into MediaRecorder
let micInjectorNode = null   // AudioWorklet node — WS fallback when direct mic capture fails
let workletNode = null
let mediaRecorder = null
let ws = null
let isStopping = false
let playbackTracks = null    // cloned tracks used for AudioContext playback

// ── WebSocket connection ──────────────────────────────
function connectWebSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      console.log('[offscreen] WebSocket connected')
      // Hello is sent from startCapture() after AudioContext is created,
      // so we can include the actual sampleRate.
      resolve(socket)
    }

    socket.onerror = (err) => {
      console.error('[offscreen] WebSocket error:', err)
      reject(new Error('WebSocket connection failed — is Scribely running?'))
    }

    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 2) return
      const view = new Uint8Array(event.data)

      if (view[0] === MSG_CONTROL) {
        // Handle control messages from Electron (e.g. stop-capture)
        try {
          const json = new TextDecoder().decode(view.slice(1))
          const msg = JSON.parse(json)
          if (msg.type === 'stop-capture') {
            console.log('[offscreen] Received stop-capture from Electron')
            stopCapture()
          } else if (msg.type === 'watch-doc') {
            watchDoc(msg.url, msg.pollSec)
          }
        } catch { /* ignore parse errors */ }
      } else if (view[0] === MSG_MIC) {
        // Mic PCM forwarded from Electron — inject into the recording mixer
        if (micInjectorNode) {
          const pcmBuf = event.data.slice(1) // new aligned ArrayBuffer
          micInjectorNode.port.postMessage(pcmBuf, [pcmBuf])
        }
      }
    }

    socket.onclose = () => {
      console.log('[offscreen] WebSocket closed')
      // If Electron quits or the WS drops, stop capturing
      if (mediaStream) {
        console.log('[offscreen] WS lost — stopping capture')
        stopCapture()
      }
    }

    // Timeout after 5 seconds
    setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        socket.close()
        reject(new Error('WebSocket connection timed out'))
      }
    }, 5000)
  })
}

function sendControl(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const json = JSON.stringify(payload)
  const header = new Uint8Array([MSG_CONTROL])
  const body = new TextEncoder().encode(json)
  const msg = new Uint8Array(header.length + body.length)
  msg.set(header)
  msg.set(body, 1)
  socket.send(msg.buffer)
}

function sendAudioFrame(socket, pcmBuffer) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const header = new Uint8Array([MSG_AUDIO])
  const pcmBytes = new Uint8Array(pcmBuffer)
  const msg = new Uint8Array(header.length + pcmBytes.length)
  msg.set(header)
  msg.set(pcmBytes, 1)
  socket.send(msg.buffer)
}

function sendVideoChunk(socket, data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const header = new Uint8Array([MSG_VIDEO])
  const bytes = new Uint8Array(data)
  const msg = new Uint8Array(header.length + bytes.length)
  msg.set(header)
  msg.set(bytes, 1)
  socket.send(msg.buffer)
}

// ── Live doc sync ─────────────────────────────────────
//
// Google Docs exposes a plain-text export of any doc the signed-in user can
// read.  Fetching it from the extension (host_permissions + credentials:
// 'include') rides on the user's existing Chrome session — no OAuth, no API
// key.  Electron tells us which doc via a `watch-doc` control message; we
// poll it and push the text back whenever it changes.
//
let docTimer = null
let docLastSent = null

function docExportUrl(url) {
  const m = /docs\.google\.com\/document\/d\/([^/?#]+)/.exec(url || '')
  return m ? `https://docs.google.com/document/d/${m[1]}/export?format=txt` : null
}

async function pollDoc(exportUrl) {
  let payload
  try {
    const res = await fetch(exportUrl, { credentials: 'include' })
    const text = await res.text()
    // A sign-in / consent page comes back as HTML, not the doc.
    payload = !res.ok || /^\s*<(!doctype|html)/i.test(text)
      ? { type: 'doc', error: `HTTP ${res.status} — open the doc in this Chrome profile and sign in` }
      : { type: 'doc', text }
  } catch (err) {
    payload = { type: 'doc', error: err.message }
  }
  const key = payload.text ?? `err:${payload.error}`
  if (key === docLastSent) return
  docLastSent = key
  sendControl(ws, payload)
}

function watchDoc(url, pollSec = 15) {
  stopDocWatch()
  const exportUrl = docExportUrl(url)
  if (!exportUrl) return
  console.log('[offscreen] Watching doc', exportUrl)
  pollDoc(exportUrl)
  docTimer = setInterval(() => pollDoc(exportUrl), pollSec * 1000)
}

function stopDocWatch() {
  if (docTimer) clearInterval(docTimer)
  docTimer = null
  docLastSent = null
}

// ── Start capture via tabCapture stream ID ─
async function startCapture(streamId, wsPort) {
  isStopping = false // reset guard for new session
  try {
    // 1. Get the media stream from the tab capture stream ID
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
    })

    console.log(
      `[offscreen] Got media stream: ${mediaStream.getAudioTracks().length} audio, ` +
      `${mediaStream.getVideoTracks().length} video tracks`
    )

    // 2. Connect to Electron's WebSocket server
    ws = await connectWebSocket(wsPort)

    // 3. Send hello IMMEDIATELY so Electron sets captureClient before any audio.
    //    Otherwise the first audio frames are dropped (server ignores audio from
    //    non-capture clients). Sample rate may be updated after setupAudioCapture.
    let actualSampleRate = TARGET_SAMPLE_RATE
    sendControl(ws, {
      type: 'hello',
      source: 'chrome-extension',
      sampleRate: actualSampleRate,
    })

    // 4. Set up AudioWorklet for PCM extraction + low-latency playback
    const audioTracks = mediaStream.getAudioTracks()
    if (audioTracks.length > 0) {
      await setupAudioCapture(mediaStream)
      if (audioContext) {
        actualSampleRate = audioContext.sampleRate
      }
    }

    // 5. Try to capture local mic directly (works after user grants
    //    permission via the permissions page — same extension origin).
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log('[offscreen] Direct mic capture OK')
    } catch (err) {
      console.warn('[offscreen] Direct mic capture failed (' + err.name + ') — will use WS fallback')
      micStream = null
    }

    // 6. Set up MediaRecorder with mixed audio (tab + mic) + tab video.
    //    If direct mic capture worked, mix it in directly.
    //    Otherwise, set up the WS-based PCM injector as fallback so
    //    Electron can relay mic audio back to us.
    const videoTracks = mediaStream.getVideoTracks()
    if (videoTracks.length > 0) {
      const recordingStream = await createMixedRecordingStream(mediaStream, micStream)
      setupVideoCapture(recordingStream)
    }

    // Notify background that capture started
    chrome.runtime.sendMessage({ type: 'capture-started' })

    // Listen for stream ending (user revokes tab sharing)
    mediaStream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        console.log(`[offscreen] Track ended: ${track.kind}`)
        stopCapture()
      })
    })
  } catch (err) {
    console.error('[offscreen] Start capture failed:', err)
    chrome.runtime.sendMessage({ type: 'capture-error', error: err.message })
    stopCapture()
  }
}

// ── Audio capture via AudioWorklet + low-latency playback ──
//
// Two separate AudioContexts:
//   1. captureCtx (audioContext) at 16 kHz — Chrome's built-in resampler
//      converts the tab's native 48 kHz audio to 16 kHz with a proper
//      anti-aliased sinc filter.  The AudioWorklet then extracts clean
//      16 kHz PCM that goes straight to Whisper without any further
//      resampling in Electron (the pipeline's linear-interp resampler
//      becomes a no-op since source == target == 16 kHz).
//   2. playbackCtx at native rate — routes cloned audio tracks to the
//      user's speakers with the lowest possible latency.
//
async function setupAudioCapture(stream) {
  const audioOnly = new MediaStream(stream.getAudioTracks())

  // ── Capture context at 16 kHz ──
  // Chrome will accept 16 kHz and resample internally with a high-quality
  // filter.  Fall back to native rate if the browser refuses.
  try {
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  } catch {
    audioContext = new AudioContext()
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  await audioContext.audioWorklet.addModule('pcm-worklet.js')

  const source = audioContext.createMediaStreamSource(audioOnly)
  workletNode = new AudioWorkletNode(audioContext, 'pcm-extractor')

  workletNode.port.onmessage = (e) => {
    if (e.data.pcm) {
      sendAudioFrame(ws, e.data.pcm)
    }
  }

  source.connect(workletNode)
  const silencer = audioContext.createGain()
  silencer.gain.value = 0
  workletNode.connect(silencer)
  silencer.connect(audioContext.destination)

  // ── Playback context at native rate ──
  // Separate context so the 16 kHz capture rate doesn't add latency or
  // degrade the audio the user hears through their speakers.
  playbackCtx = new AudioContext({ latencyHint: 'interactive' })
  if (playbackCtx.state === 'suspended') {
    await playbackCtx.resume()
  }

  playbackTracks = stream.getAudioTracks().map(t => t.clone())
  const playbackStream = new MediaStream(playbackTracks)
  const playbackSource = playbackCtx.createMediaStreamSource(playbackStream)
  playbackSource.connect(playbackCtx.destination)

  console.log(
    `[offscreen] Audio capture at ${audioContext.sampleRate}Hz, ` +
    `playback at ${playbackCtx.sampleRate}Hz`
  )
}

// ── Mix tab audio + mic audio for recording ───────────
//
// Two paths for mic audio:
//   1. Direct: getUserMedia succeeds (permission pre-granted via permissions page)
//   2. Fallback: Electron relays mic PCM over WebSocket → AudioWorklet injector
//
async function createMixedRecordingStream(tabStream, localMicStream) {
  mixerCtx = new AudioContext()
  if (mixerCtx.state === 'suspended') {
    await mixerCtx.resume()
  }

  // Tab audio source
  const tabSource = mixerCtx.createMediaStreamSource(
    new MediaStream(tabStream.getAudioTracks())
  )
  const dest = mixerCtx.createMediaStreamDestination()
  tabSource.connect(dest)

  if (localMicStream) {
    // ── Direct mic path (preferred) ──────────────────────
    const micSource = mixerCtx.createMediaStreamSource(localMicStream)
    micSource.connect(dest)
    console.log('[offscreen] Mixer: tab audio + DIRECT mic')
  } else {
    // ── WS fallback path ─────────────────────────────────
    await mixerCtx.audioWorklet.addModule('pcm-injector-worklet.js')
    micInjectorNode = new AudioWorkletNode(mixerCtx, 'pcm-injector', {
      processorOptions: { sourceRate: TARGET_SAMPLE_RATE }, // 16 kHz
    })
    micInjectorNode.connect(dest)
    console.log('[offscreen] Mixer: tab audio + WS mic injector (fallback)')
  }

  // Keep the AudioContext alive by also connecting to the main destination
  // (silenced).  Without this, Chrome may aggressively suspend the context.
  const silencer = mixerCtx.createGain()
  silencer.gain.value = 0
  tabSource.connect(silencer)
  silencer.connect(mixerCtx.destination)

  // Combine: mixed audio (tab + mic) + tab video
  const mixed = new MediaStream([
    ...dest.stream.getAudioTracks(),
    ...tabStream.getVideoTracks(),
  ])

  console.log(
    `[offscreen] Recording mixer ready (${mixerCtx.sampleRate}Hz): ` +
    `${mixed.getAudioTracks().length} audio + ${mixed.getVideoTracks().length} video tracks`
  )
  return mixed
}

// ── Video capture via MediaRecorder ───────────────────
function setupVideoCapture(stream) {
  // Use the full stream (audio + video) so the saved .webm includes sound.
  // Audio also goes through the AudioWorklet for real-time transcription —
  // both consumers can read from the same tracks simultaneously.
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm;codecs=vp8'

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000, // 2.5 Mbps
  })

  mediaRecorder.ondataavailable = async (e) => {
    if (e.data.size > 0) {
      const buffer = await e.data.arrayBuffer()
      sendVideoChunk(ws, buffer)
    }
  }

  mediaRecorder.onstop = () => {
    console.log('[offscreen] MediaRecorder stopped')
  }

  // Request data every 1 second
  mediaRecorder.start(1000)
  console.log(`[offscreen] Video recording started (${mimeType})`)
}

// ── Stop capture ──────────────────────────────────────
function stopCapture() {
  if (isStopping) return
  isStopping = true

  // CRITICAL: Notify desktop app FIRST, before releasing any media tracks.
  // Once we stop the tab capture tracks, Chrome may destroy the offscreen
  // document (USER_MEDIA justification is lost), which tears down the
  // WebSocket before we can send capture-stopped. Sending first ensures
  // the desktop receives the signal and stops its recording.
  stopDocWatch()
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendControl(ws, { type: 'capture-stopped' })
    ws.close()
  }
  ws = null

  chrome.runtime.sendMessage({ type: 'capture-stopped' })

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  mediaRecorder = null

  if (workletNode) {
    workletNode.disconnect()
    workletNode = null
  }

  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }

  if (playbackCtx) {
    playbackCtx.close().catch(() => {})
    playbackCtx = null
  }

  // Stop local mic stream (direct capture path)
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop())
    micStream = null
  }

  if (micInjectorNode) {
    micInjectorNode.disconnect()
    micInjectorNode = null
  }

  if (mixerCtx) {
    mixerCtx.close().catch(() => {})
    mixerCtx = null
  }

  // Stop cloned playback tracks
  if (playbackTracks) {
    playbackTracks.forEach(t => t.stop())
    playbackTracks = null
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
  console.log('[offscreen] Capture stopped — all resources cleaned up')
  // NOTE: isStopping stays true to block late async callbacks (e.g.
  // track "ended" events fired after track.stop()).  It is reset at the
  // top of startCapture() when a new session begins.
}

// ── Listen for messages from background ───────────────
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'start-capture':
      startCapture(message.streamId, message.wsPort)
      break
    case 'stop-capture':
      stopCapture()
      break
  }
})
