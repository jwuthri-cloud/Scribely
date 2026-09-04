import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// In-memory stand-in for the Docs API with the same index contract as scripts/simulate.mjs:
// body starts at index 1, one paragraph per line, each '\n'-terminated.
let lines = ['Agenda', 'Pricing', 'Next steps']
let revision = 1
let rejectNextWrite = false
let server: Server
let insertAfter: typeof import('./google-docs').insertAfter

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const json = (code: number, obj: unknown) => { res.writeHead(code); res.end(JSON.stringify(obj)) }
    if (req.method === 'GET') {
      let idx = 1
      const content = lines.map((l) => {
        const el = { startIndex: idx, endIndex: idx + l.length + 1, paragraph: { elements: [{ textRun: { content: `${l}\n` } }] } }
        idx = el.endIndex
        return el
      })
      return json(200, { revisionId: String(revision), body: { content } })
    }
    let body = ''
    for await (const c of req) body += c
    const { writeControl, requests } = JSON.parse(body)
    if (rejectNextWrite) { rejectNextWrite = false; revision++; return json(400, { error: { message: 'revision mismatch' } }) }
    if (writeControl.requiredRevisionId !== String(revision)) return json(400, { error: { message: 'revision mismatch' } })
    let text = `${lines.join('\n')}\n`
    for (const r of requests) if (r.insertText) { const i = r.insertText.location.index - 1; text = text.slice(0, i) + r.insertText.text + text.slice(i) }
    lines = text.replace(/\n$/, '').split('\n')
    revision++
    json(200, { replies: [] })
  })
  await new Promise<void>((r) => server.listen(0, r))
  process.env.SCRIBELY_DOCS_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  ;({ insertAfter } = await import('./google-docs'))
})
afterAll(() => server.close())

describe('insertAfter', () => {
  it('inserts a new paragraph after the matching line, appends when no anchor, retries once on revision conflict', async () => {
    await insertAfter('doc', 'tok', 'Note A', 'pricing') // case/whitespace-insensitive match
    expect(lines).toEqual(['Agenda', 'Pricing', 'Note A', 'Next steps'])

    await insertAfter('doc', 'tok', 'Note B', null)
    expect(lines).toEqual(['Agenda', 'Pricing', 'Note A', 'Next steps', 'Note B'])

    rejectNextWrite = true
    await insertAfter('doc', 'tok', 'Note C', 'no such line')
    expect(lines.at(-1)).toBe('Note C')
  })
})
