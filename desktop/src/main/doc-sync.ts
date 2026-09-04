import { createLogger } from './logger'
import { fetchDoc, insertAfter, parseDocId, HttpError } from './google-docs'

const log = createLogger('doc-sync')

/** Mirrored in renderer/src/types/index.ts */
export interface DocStatus {
  state: 'idle' | 'synced' | 'error'
  chars: number
  updatedAt: number | null
  error: string | null
  lastWrite: { at: number; ok: boolean; error?: string } | null
}

const IDLE: DocStatus = { state: 'idle', chars: 0, updatedAt: null, error: null, lastWrite: null }

/**
 * Keeps the live Google Doc in the LLM's context and writes task results back,
 * via the Docs API with the user's OAuth token (backend → Clerk). Polls while a
 * meeting is active.
 */
export function createDocSync(opts: {
  getDocUrl: () => string
  getPollMs: () => number
  getToken: () => Promise<string>
  /** Returns an error message when the doc can't be used (e.g. exceeds the model's context) */
  onText: (text: string | null) => string | null | void
  onStatus: (status: DocStatus) => void
}) {
  let status: DocStatus = IDLE
  let timer: NodeJS.Timeout | null = null
  let active = false
  let token: { value: string; at: number } | null = null
  let lastText: string | null = null
  let lastError: string | null = null

  const set = (patch: Partial<DocStatus>): void => {
    status = { ...status, ...patch }
    opts.onStatus(status)
  }

  const docId = (): string | null => parseDocId(opts.getDocUrl())

  async function getToken(force = false): Promise<string> {
    if (!force && token && Date.now() - token.at < 30 * 60_000) return token.value
    token = { value: await opts.getToken(), at: Date.now() }
    return token.value
  }

  /** Run `fn` with a token; refresh once on 401. */
  async function withToken<T>(fn: (t: string) => Promise<T>): Promise<T> {
    try {
      return await fn(await getToken())
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) return fn(await getToken(true))
      throw e
    }
  }

  let rejected: string | null = null
  function publish(text: string): void {
    if (text !== lastText) {
      lastText = text
      rejected = opts.onText(text) || null
    }
    lastError = null
    set({ state: rejected ? 'error' : 'synced', chars: text.length, updatedAt: Date.now(), error: rejected })
  }

  async function poll(): Promise<DocStatus> {
    const id = docId()
    if (!id) return status
    try {
      const doc = await withToken((t) => fetchDoc(id, t))
      publish(doc.text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== lastError) log.warn(`Poll failed: ${msg}`)
      lastError = msg
      set({ state: 'error', error: msg })
    }
    return status
  }

  return {
    get status(): DocStatus {
      return status
    },

    /** Meeting started/stopped: poll continuously while active, clear when done. */
    setActive(on: boolean): void {
      active = on
      if (timer) clearInterval(timer)
      timer = null
      if (!on) {
        lastText = null
        opts.onText(null)
        set(IDLE)
        return
      }
      if (!docId()) return
      void poll()
      timer = setInterval(() => void poll(), opts.getPollMs())
    },

    /** Settings changed or "Sync now": re-arm the poller if active, else a single poll. */
    async refresh(): Promise<DocStatus> {
      if (!docId()) {
        lastText = null
        opts.onText(null)
        set(IDLE)
        return status
      }
      if (active) {
        this.setActive(true)
        return status
      }
      return poll()
    },

    /** Insert a task result into the doc (insert-only, revision-guarded). */
    async write(text: string, afterQuote: string | null): Promise<void> {
      const id = docId()
      if (!id) return
      try {
        await withToken((t) => insertAfter(id, t, text, afterQuote))
        set({ lastWrite: { at: Date.now(), ok: true } })
        void poll() // pick up our own insertion right away
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log.warn(`Write failed: ${msg}`)
        set({ lastWrite: { at: Date.now(), ok: false, error: msg } })
      }
    },
  }
}
