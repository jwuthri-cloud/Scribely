/**
 * Meeting URL detection for Scribely Tab Capture.
 *
 * Patterns based on common meeting platforms (Google Meet, Zoom, Teams, Webex, GoTo).
 * @see https://docs.recall.ai/docs/meeting-urls
 */

const MEETING_PATTERNS = [
  // Google Meet: meet.google.com/xxx-xxxx-xxx
  /meet\.google\.com\/(\w{3}-\w{4}-\w{3})/,
  // Zoom: zoom.us/j/..., zoom.us/s/..., zoom.us/wc/join/..., zoom.us/my/..., zoom.us/w/...
  /zoom\.(us|com)\/(j|s|wc\/join|my|w)\//,
  /zoom\.(us|com)\/(j|s|wc\/join)\/\d+/,
  // Microsoft Teams
  /teams\.microsoft\.com/,
  /teams\.live\.com/,
  // Webex
  /\.webex\.com\/(meet|join)\//,
  /\.webex\.com\/.+\/j\.php/,
  // GoTo Meeting
  /(app\.goto\.com|meet\.goto\.com|gotomeet\.me|global\.gotomeeting\.com)\//,
]

/**
 * Returns true if the URL is a known meeting platform.
 * @param {string} url - Tab URL (may be undefined for chrome:// etc.)
 * @returns {boolean}
 */
export function isMeetingUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const normalized = url.trim().toLowerCase()
    return MEETING_PATTERNS.some((re) => re.test(normalized))
  } catch {
    return false
  }
}
