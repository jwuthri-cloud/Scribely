import { BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import Store from 'electron-store'
import { createLogger } from '../logger'
import { AuthCallbackServer, type AuthCompletePayload } from './auth-callback-server'

const log = createLogger('auth')

export interface AuthUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  imageUrl: string | null
}

export interface AuthState {
  mode: 'guest' | 'authenticated'
  user: AuthUser | null
}

interface AuthStoreSchema {
  mode: 'guest' | 'authenticated'
  user: AuthUser | null
  sessionTokenEncrypted: string | null
}

export class AuthService {
  private store: Store<AuthStoreSchema>
  private callbackServer: AuthCallbackServer
  private window: BrowserWindow | null = null
  /** Called after a fresh sign-in (new token stored). Used to flush upload queue. */
  private onSignedInCallback: (() => void) | null = null

  constructor() {
    this.store = new Store<AuthStoreSchema>({
      name: 'auth',
      defaults: {
        mode: 'guest',
        user: null,
        sessionTokenEncrypted: null,
      },
    })
    this.callbackServer = new AuthCallbackServer()
  }

  setWindow(window: BrowserWindow | null): void {
    this.window = window
  }

  setOnSignedIn(cb: (() => void) | null): void {
    this.onSignedInCallback = cb
  }

  getState(): AuthState {
    return {
      mode: this.store.get('mode'),
      user: this.store.get('user'),
    }
  }

  getUserProfile(): AuthUser | null {
    return this.store.get('user')
  }

  private notifyRenderer(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('auth:state-changed', this.getState())
    }
  }

  private storeSessionToken(token: string): void {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buf = safeStorage.encryptString(token)
        this.store.set('sessionTokenEncrypted', buf.toString('base64'))
        return
      } catch {
        // Fall through — store nothing rather than plain text
      }
    }
    log.warn('safeStorage unavailable — session token not persisted')
  }

  private clearSessionToken(): void {
    this.store.set('sessionTokenEncrypted', null)
  }

  /**
   * Invalidate the stored token (e.g. after a 401 from the backend).
   * Keeps user profile and mode so the UI still shows "signed in", but
   * API calls will fail until the user signs in again to get a fresh token.
   */
  invalidateToken(): void {
    log.info('Token invalidated (likely expired) — user must sign in again for API access')
    this.clearSessionToken()
  }

  getSessionToken(): string | null {
    const encrypted = this.store.get('sessionTokenEncrypted')
    if (encrypted && safeStorage.isEncryptionAvailable()) {
      try {
        const buf = Buffer.from(encrypted, 'base64')
        return safeStorage.decryptString(buf)
      } catch {
        return null
      }
    }
    return null
  }

  async startSignIn(): Promise<{ success: boolean; error?: string }> {
    const publishableKey = process.env.CLERK_PUBLISHABLE_KEY
    if (!publishableKey) {
      return { success: false, error: 'CLERK_PUBLISHABLE_KEY not configured' }
    }

    try {
      this.callbackServer.removeAllListeners('signed-in')
      this.callbackServer.on('signed-in', (payload: AuthCompletePayload) => {
        this.handleSignedIn(payload)
      })

      const port = await this.callbackServer.start(publishableKey)
      await shell.openExternal(`http://127.0.0.1:${port}/auth`)
      return { success: true }
    } catch (err: any) {
      log.error('Failed to start sign-in:', err)
      return { success: false, error: err?.message || 'Failed to start sign-in' }
    }
  }

  private handleSignedIn(payload: AuthCompletePayload): void {
    log.info('User signed in:', payload.user.email)

    this.store.set('mode', 'authenticated')
    this.store.set('user', payload.user)

    if (payload.sessionToken) {
      this.storeSessionToken(payload.sessionToken)
    }

    this.notifyRenderer()
    this.onSignedInCallback?.()
  }

  async signOut(): Promise<void> {
    log.info('User signing out')
    this.store.set('mode', 'guest')
    this.store.set('user', null)
    this.clearSessionToken()
    this.notifyRenderer()
  }

  async skip(): Promise<void> {
    log.info('User skipped sign-in')
    // Don't persist skip — next launch will show auth gate again
    this.notifyRenderer()
  }

  handleOpenUrl(url: string): boolean {
    if (!url.startsWith('scribely://auth/callback')) return false
    log.info('Received auth callback deep link:', url)
    // Deep link fallback — currently the local HTTP server handles callbacks,
    // but this is here for future extensibility.
    return true
  }

  registerIpcHandlers(): void {
    ipcMain.handle('auth:start-sign-in', () => {
      return this.startSignIn()
    })

    ipcMain.handle('auth:skip', () => {
      return this.skip()
    })

    ipcMain.handle('auth:get-state', () => {
      return this.getState()
    })

    ipcMain.handle('auth:sign-out', () => {
      return this.signOut()
    })

    ipcMain.handle('auth:get-user-profile', () => {
      return this.getUserProfile()
    })
  }

  destroy(): void {
    this.callbackServer.stop()
  }
}
