/**
 * Content script: floating popup on meeting pages.
 * User clicks Record → recording starts (getDisplayMedia picker).
 */

;(function () {
  const WIDGET_ID = 'scribely-meeting-widget'
  if (document.getElementById(WIDGET_ID)) return

  let connected = false
  let capturing = false
  let elapsed = 0
  let timerInterval = null

  const host = document.createElement('div')
  host.id = WIDGET_ID
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:16px;right:16px;'
  const shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    * { margin:0; padding:0; box-sizing:border-box; }
    .widget {
      font-family: system-ui, -apple-system, sans-serif;
      width: 260px;
      background: rgba(18,18,22,0.95);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 12px 14px;
      color: #e4e4e7;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot.green { background: #22c55e; }
    .dot.red { background: #ef4444; }
    .status { font-size: 12px; font-weight: 500; }
    .btn {
      width: 100%;
      border: none;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #22c55e;
    }
    .btn:hover { background: #16a34a; }
    .btn.stop { background: #ef4444; }
    .btn.stop:hover { background: #dc2626; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .timer { font-size: 11px; color: #a1a1aa; margin-left: auto; }
    .launch { font-size: 11px; margin-top: 8px; }
    .launch a { color: #60a5fa; text-decoration: none; }
    .launch a:hover { text-decoration: underline; }
    .err { font-size: 11px; color: #fca5a5; margin-top: 6px; }
  `

  const widget = document.createElement('div')
  widget.className = 'widget'
  widget.innerHTML = `
    <div class="row">
      <span class="dot" id="dot"></span>
      <span class="status" id="status">Checking...</span>
      <span class="timer" id="timer" style="display:none">00:00</span>
    </div>
    <div id="launchRow" style="display:none" class="launch">
      <a href="#" id="launchLink">Launch Scribely</a>
    </div>
    <button class="btn" id="recordBtn" style="display:none">Record Meeting</button>
    <div id="errBox" class="err" style="display:none"></div>
  `

  shadow.appendChild(style)
  shadow.appendChild(widget)
  document.documentElement.appendChild(host)

  const dot = shadow.getElementById('dot')
  const statusEl = shadow.getElementById('status')
  const timerEl = shadow.getElementById('timer')
  const launchRow = shadow.getElementById('launchRow')
  const launchLink = shadow.getElementById('launchLink')
  const recordBtn = shadow.getElementById('recordBtn')
  const errBox = shadow.getElementById('errBox')

  let pendingRecord = false
  function render() {
    dot.className = 'dot ' + (connected ? 'green' : 'red')
    statusEl.textContent = pendingRecord && !capturing
      ? 'Click Scribely icon in toolbar →'
      : connected ? 'Connected' : 'Not running'
    timerEl.style.display = capturing ? '' : 'none'
    launchRow.style.display = connected ? 'none' : ''
    recordBtn.style.display = connected ? '' : 'none'
    recordBtn.textContent = capturing ? 'Stop Recording' : 'Record Meeting'
    recordBtn.className = 'btn' + (capturing ? ' stop' : '')
  }

  function formatTime(s) {
    const m = String(Math.floor(s / 60)).padStart(2, '0')
    const sec = String(s % 60).padStart(2, '0')
    return m + ':' + sec
  }

  function startTimer() {
    stopTimer()
    elapsed = 0
    timerInterval = setInterval(() => {
      elapsed++
      timerEl.textContent = formatTime(elapsed)
    }, 1000)
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  function showErr(msg) {
    errBox.textContent = msg
    errBox.style.display = ''
  }

  function clearErr() {
    errBox.style.display = 'none'
  }

  function send(msg) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime?.id) {
          reject(new Error('Extension reloaded'))
          return
        }
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else resolve(r)
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'scribely:state-update') {
      connected = !!msg.connected
      const was = capturing
      capturing = !!msg.isCapturing
      if (capturing && !was) {
        pendingRecord = false
        startTimer()
      }
      if (!capturing && was) stopTimer()
      clearErr()
      render()
    }
  })

  recordBtn.addEventListener('click', async () => {
    clearErr()
    recordBtn.disabled = true
    try {
      if (capturing) {
        const r = await send({ type: 'stop-capture-request' })
        if (r?.success) {
          capturing = false
          stopTimer()
        } else showErr(r?.error || 'Failed to stop')
      } else {
        const r = await send({ type: 'content:request-capture' })
        if (r?.success) {
          pendingRecord = true
        } else {
          showErr(r?.error || 'Failed to start')
        }
      }
    } catch (e) {
      showErr(e.message)
    } finally {
      recordBtn.disabled = false
      render()
    }
  })

  launchLink.addEventListener('click', (e) => {
    e.preventDefault()
    send({ type: 'content:launch-app' })
  })

  async function fetchStatus() {
    try {
      const s = await send({ type: 'content:get-status' })
      if (s) {
        connected = !!s.connected
        capturing = !!s.isCapturing
        if (capturing && !timerInterval) startTimer()
        if (!capturing) stopTimer()
      }
    } catch (_) {}
    render()
  }

  fetchStatus()
  setInterval(fetchStatus, 5000)
})()
