/**
 * Load desktop/.env from cwd (dev) and from app Resources when packaged.
 * Inlined build-time env (Vite `define` in electron.vite.config) covers Clerk
 * in production; this file still loads Langfuse and other optional secrets from disk.
 */
import { app } from 'electron'
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'

function tryLoad(path: string): void {
  if (existsSync(path)) {
    config({ path, quiet: true, override: false })
  }
}

// npm run dev: cwd is usually desktop/
tryLoad(join(process.cwd(), '.env'))

try {
  if (app.isPackaged) {
    tryLoad(join(process.resourcesPath, '.env'))
  } else {
    tryLoad(join(app.getAppPath(), '.env'))
  }
} catch {
  // Ignore if app paths are not available yet
}
