/**
 * Permissions page — requests microphone access for the extension origin.
 *
 * Once granted here, the offscreen document (same origin) can call
 * getUserMedia({ audio: true }) without a prompt.
 */

const grantBtn = document.getElementById('grantBtn')
const status = document.getElementById('status')

grantBtn.addEventListener('click', async () => {
  grantBtn.disabled = true
  status.textContent = 'Requesting access…'
  status.className = ''

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Release the mic immediately — we only needed the permission grant
    stream.getTracks().forEach(t => t.stop())

    status.textContent = 'Microphone access granted! Closing…'
    status.className = 'ok'

    // Notify background so it knows permission is ready
    chrome.runtime.sendMessage({ type: 'mic-permission-granted' })

    // Auto-close this tab after a short delay
    setTimeout(() => window.close(), 1500)
  } catch (err) {
    status.textContent = `Access denied: ${err.message}`
    status.className = 'err'
    grantBtn.disabled = false
  }
})

// Check if already granted
;(async () => {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' })
    if (result.state === 'granted') {
      status.textContent = 'Microphone access already granted! Closing…'
      status.className = 'ok'
      grantBtn.disabled = true
      chrome.runtime.sendMessage({ type: 'mic-permission-granted' })
      setTimeout(() => window.close(), 1500)
    }
  } catch { /* permissions API not available — user clicks button */ }
})()
