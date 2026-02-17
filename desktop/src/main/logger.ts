/**
 * Rich console logger — Python "rich"-style output for the desktop app.
 * Uses consola for colored, tagged logs with info/warn/success/error levels.
 *
 * Usage:
 *   const log = createLogger('llm')
 *   log.info('Summarization triggered')
 *   log.success('Model loaded')
 *   log.warn('API key missing')
 *   log.error('Request failed', err)
 */

import { createConsola } from 'consola'

// Consola auto-detects TTY and uses fancy colored output when available.
// Set CONSOLA_LEVEL=0-5 to control verbosity (default: 4 in dev, 2 in prod).
const level = process.env.CONSOLA_LEVEL
  ? parseInt(process.env.CONSOLA_LEVEL, 10)
  : process.env.NODE_ENV === 'production'
    ? 2 // info and below in prod
    : 4 // debug in dev

const base = createConsola({
  level: Number.isNaN(level) ? 4 : level,
})

/** Create a scoped logger with a tag (e.g. 'llm', 'insight-engine'). */
export function createLogger(tag: string) {
  return base.withTag(tag)
}

/** Default logger for ad-hoc use. */
export const log = base
