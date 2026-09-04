#!/usr/bin/env node
// Meeting simulator — pretends to be the Chrome extension so you can watch
// STT, insights, the live task and the live doc run without a real call.
//
//   node scripts/simulate.mjs transcript.txt            # each line spoken via macOS `say`
//   node scripts/simulate.mjs call.mp3|mp4              # any media, decoded by ffmpeg
//   node scripts/simulate.mjs x.txt --doc notes.md      # local file stands in for the Google Doc:
//                                                       # pushed over WS (extension path) AND served by
//                                                       # a fake Docs API on :9878 so write-back works.
//                                                       # Start Scribely with
//                                                       #   SCRIBELY_DOCS_API_URL=http://127.0.0.1:9878 SCRIBELY_GOOGLE_TOKEN=x
//   --speed 2   stream faster than real time      --port 9876
//
// Connects to the desktop WS server, sends `hello` (Electron auto-starts the
// meeting), streams 16 kHz PCM as "Them", then stays connected until Ctrl+C
// (which ends the meeting). Requires ffmpeg (`brew install ffmpeg`).
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, statSync, watch, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values: opts, positionals: [input] } = parseArgs({
  allowPositionals: true,
  options: {
    doc: { type: 'string' },
    speed: { type: 'string', default: '1' },
    port: { type: 'string', default: '9876' },
  },
})
if (!input) {
  console.error('usage: node scripts/simulate.mjs <transcript.txt | audio.mp3 | video.mp4> [--doc file] [--speed 1]')
  process.exit(1)
}

const RATE = 16000
const FRAME = 1600 // 100 ms of samples
const speed = Number(opts.speed) || 1
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

// ── Connect + handshake (same protocol as chrome-extension/offscreen.js) ──
const ws = new WebSocket(`ws://127.0.0.1:${opts.port}`)
ws.binaryType = 'arraybuffer'
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = () => rej(new Error(`cannot reach ws://127.0.0.1:${opts.port} — is Scribely running?`))
})
const control = (msg) => ws.send(new Uint8Array([0x03, ...new TextEncoder().encode(JSON.stringify(msg))]))
control({ type: 'hello', source: 'chrome-extension', sampleRate: RATE })
console.log('connected — meeting auto-started')

// ── Live doc: push now, re-push on save ──
if (opts.doc) {
  const push = () => {
    control({ type: 'doc', text: readFileSync(opts.doc, 'utf8') })
    console.log(`doc pushed: ${opts.doc}`)
  }
  push()
  let t
  watch(opts.doc, () => { clearTimeout(t); t = setTimeout(push, 150) }) // editors write in bursts

  // Fake Google Docs API (documents.get + batchUpdate/insertText) over the same file.
  // Index space matches Docs: body starts at index 1, one paragraph per line, '\n' terminated.
  const lines = () => readFileSync(opts.doc, 'utf8').replace(/\n$/, '').split('\n')
  const snapshot = () => {
    let idx = 1
    const content = lines().map((l) => {
      const el = { startIndex: idx, endIndex: idx + l.length + 1, paragraph: { elements: [{ textRun: { content: `${l}\n` } }] } }
      idx = el.endIndex
      return el
    })
    return { revisionId: String(statSync(opts.doc).mtimeMs), body: { content } }
  }
  createServer(async (req, res) => {
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    if (req.method === 'GET') return json(200, snapshot())
    let body = ''
    for await (const c of req) body += c
    const { writeControl, requests } = JSON.parse(body)
    if (writeControl?.requiredRevisionId && writeControl.requiredRevisionId !== snapshot().revisionId) {
      return json(400, { error: { message: 'Required revision id does not match current revision' } })
    }
    let text = `${lines().join('\n')}\n`
    for (const r of requests) {
      if (!r.insertText) continue
      const i = r.insertText.location.index - 1
      text = text.slice(0, i) + r.insertText.text + text.slice(i)
      console.log(`doc write: ${JSON.stringify(r.insertText.text)}`)
    }
    writeFileSync(opts.doc, text)
    json(200, { replies: [] })
  }).listen(9878)
  console.log('fake Docs API on http://127.0.0.1:9878 (set SCRIBELY_DOCS_API_URL + SCRIBELY_GOOGLE_TOKEN on Scribely)')
}

// ── Audio: ffmpeg → 16 kHz mono f32 → 100 ms frames at (real time / speed) ──
async function streamAudio(path) {
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'])
  let pending = Buffer.alloc(0)
  let next = performance.now()
  for await (const chunk of ff.stdout) {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= FRAME * 4) {
      ws.send(Buffer.concat([Buffer.from([0x01]), pending.subarray(0, FRAME * 4)]))
      pending = pending.subarray(FRAME * 4)
      next += (FRAME / RATE) * 1000 / speed
      await sleep(next - performance.now())
    }
  }
  if (pending.length >= 4) ws.send(Buffer.concat([Buffer.from([0x01]), pending]))
}

// ── Text: strip "[0:42] Them:" prefixes, speak each line with `say` ──
async function speakLines(path) {
  const tmp = join(mkdtempSync(join(tmpdir(), 'scribely-sim-')), 'line.aiff')
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    // ponytail: naive prefix strip — also eats "Note: ..." style openers
    .map((l) => l.replace(/^\[?[\d:.]+\]?\s*/, '').replace(/^[\w .'-]{1,24}:\s*/, '').trim())
    .filter(Boolean)
  for (const line of lines) {
    console.log(`▶ ${line}`)
    execFileSync('say', ['-o', tmp, '-f', '-'], { input: line })
    await streamAudio(tmp)
    await sleep(400 / speed) // breath between lines
  }
}

await (/\.(txt|md)$/i.test(input) ? speakLines(input) : streamAudio(input))
console.log('streaming done — connection held open so the live task can still tick. Ctrl+C ends the meeting.')

process.on('SIGINT', () => {
  control({ type: 'capture-stopped' })
  ws.close()
  console.log('\nmeeting stopped')
  process.exit(0)
})
