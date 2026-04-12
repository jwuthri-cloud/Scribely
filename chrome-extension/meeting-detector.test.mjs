/**
 * Node built-in tests for meeting URL detection (no bundler; extension stays plain ESM).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { isMeetingUrl } from './meeting-detector.js'

test('rejects empty and non-strings', () => {
  assert.equal(isMeetingUrl(''), false)
  assert.equal(isMeetingUrl(null), false)
  assert.equal(isMeetingUrl(undefined), false)
})

test('Google Meet code URL', () => {
  assert.equal(isMeetingUrl('https://meet.google.com/abc-defg-hij'), true)
})

test('Zoom join paths', () => {
  assert.equal(isMeetingUrl('https://zoom.us/j/1234567890'), true)
  assert.equal(isMeetingUrl('https://zoom.com/wc/join/1234567890'), true)
})

test('Microsoft Teams', () => {
  assert.equal(isMeetingUrl('https://teams.microsoft.com/l/meetup-join/...'), true)
  assert.equal(isMeetingUrl('https://teams.live.com/meet/...'), true)
})

test('Webex', () => {
  assert.equal(isMeetingUrl('https://company.webex.com/meet/john'), true)
  assert.equal(isMeetingUrl('https://something.webex.com/foo/j.php?MTID=...'), true)
})

test('GoTo', () => {
  assert.equal(isMeetingUrl('https://global.gotomeeting.com/join/...'), true)
  assert.equal(isMeetingUrl('https://meet.goto.com/...'), true)
})

test('non-meeting URLs', () => {
  assert.equal(isMeetingUrl('https://example.com/video'), false)
  assert.equal(isMeetingUrl('https://google.com/search?q=meet'), false)
})

test('trim and case normalization', () => {
  assert.equal(isMeetingUrl('  HTTPS://MEET.GOOGLE.COM/aaa-bbbb-ccc  '), true)
})
