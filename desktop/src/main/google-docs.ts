import { createLogger } from './logger'

const log = createLogger('google-docs')

// ponytail: env override lets scripts/simulate.mjs stand in for Google (fake Docs API over a local file)
const API = process.env.SCRIBELY_DOCS_API_URL || 'https://docs.googleapis.com'

export class HttpError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`)
  }
}

export interface DocParagraph {
  text: string
  /** Index just past this paragraph's trailing newline (Docs API structural index) */
  endIndex: number
}

export interface DocSnapshot {
  text: string
  revisionId: string
  paragraphs: DocParagraph[]
}

interface StructuralElement {
  endIndex: number
  paragraph?: {
    elements?: Array<{
      textRun?: { content?: string }
      /** @-mention smart chip — the API already resolves it to name + email */
      person?: { personProperties?: { name?: string; email?: string } }
      richLink?: { richLinkProperties?: { title?: string; uri?: string } }
    }>
  }
  table?: { tableRows?: Array<{ tableCells?: Array<{ content?: StructuralElement[] }> }> }
}

/** fetch() that turns a connection failure into an actionable message. */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code ?? 'network error'
    throw new Error(`cannot reach ${API} (${code})${API.includes('127.0.0.1') ? ' — is the simulator running with --doc?' : ''}`)
  }
}

export function parseDocId(url: string): string | null {
  return /docs\.google\.com\/document\/d\/([^/?#]+)/.exec(url || '')?.[1] ?? null
}

export async function fetchDoc(docId: string, token: string): Promise<DocSnapshot> {
  const res = await apiFetch(`${API}/v1/documents/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new HttpError(res.status, await res.text())
  const doc = (await res.json()) as { revisionId: string; body: { content: StructuralElement[] } }
  const paragraphs = paragraphsOf(doc.body.content)
  return { text: paragraphs.map((p) => p.text).join('\n'), revisionId: doc.revisionId, paragraphs }
}

function paragraphsOf(content: StructuralElement[] | undefined): DocParagraph[] {
  const out: DocParagraph[] = []
  for (const el of content ?? []) {
    if (el.paragraph) {
      const text = (el.paragraph.elements ?? [])
        .map((e) => {
          if (e.person) return `@${e.person.personProperties?.name || e.person.personProperties?.email || 'someone'}`
          if (e.richLink) return `[${e.richLink.richLinkProperties?.title ?? 'link'}](${e.richLink.richLinkProperties?.uri ?? ''})`
          return e.textRun?.content ?? ''
        })
        .join('')
        .replace(/\n$/, '')
      out.push({ text, endIndex: el.endIndex })
    } else if (el.table) {
      for (const row of el.table.tableRows ?? [])
        for (const cell of row.tableCells ?? []) out.push(...paragraphsOf(cell.content))
    }
  }
  return out
}

/**
 * Insert `text` as a new paragraph right after the paragraph best matching
 * `afterQuote` (end of document when null or no match). Always re-fetches the
 * document first and guards the write with `requiredRevisionId`, so a
 * concurrent edit cannot shift the index under us; retries once on conflict.
 * Insert-only — the rest of the document is never touched.
 */
export async function insertAfter(
  docId: string,
  token: string,
  text: string,
  afterQuote: string | null,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const doc = await fetchDoc(docId, token)
    const anchor = findParagraph(doc.paragraphs, afterQuote) ?? doc.paragraphs.at(-1)
    if (!anchor) throw new Error('document has no paragraphs')
    const at = anchor.endIndex - 1 // just before the anchor's trailing newline
    const body = {
      writeControl: { requiredRevisionId: doc.revisionId },
      requests: [
        { insertText: { location: { index: at }, text: `\n${text}` } },
        // the new paragraph must not inherit a heading style from its anchor
        {
          updateParagraphStyle: {
            range: { startIndex: at + 1, endIndex: at + 1 + text.length },
            paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
            fields: 'namedStyleType',
          },
        },
      ],
    }
    const res = await apiFetch(`${API}/v1/documents/${docId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return
    const err = await res.text()
    if (res.status === 400 && attempt === 0 && /revision/i.test(err)) {
      log.info('Revision changed under us — refetching and retrying insert')
      continue
    }
    throw new HttpError(res.status, err)
  }
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

function findParagraph(paragraphs: DocParagraph[], quote: string | null): DocParagraph | undefined {
  const q = norm(quote ?? '')
  if (!q) return undefined
  return paragraphs.find((p) => {
    const t = norm(p.text)
    return t.length > 0 && (t.includes(q) || (t.length >= 12 && q.includes(t)))
  })
}
