import http from 'node:http'
import { EventEmitter } from 'node:events'
import { createLogger } from '../logger'

const log = createLogger('auth-callback')

export interface AuthCompletePayload {
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    fullName: string | null
    imageUrl: string | null
  }
  sessionToken: string
}

/**
 * Derive the Clerk Frontend API URL from a publishable key.
 * The key format is `pk_test_<base64(fapi_url + "$")>` or `pk_live_<base64(...)>`.
 */
function getFrontendApiUrl(publishableKey: string): string {
  const raw = publishableKey.replace(/^pk_(test|live)_/, '')
  const decoded = Buffer.from(raw, 'base64').toString('utf-8')
  return decoded.replace(/\$$/, '')
}

export class AuthCallbackServer extends EventEmitter {
  private server: http.Server | null = null
  private port = 0
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null
  private fapiUrl = ''

  /** Start the local HTTP server on a random available port. */
  async start(clerkPublishableKey: string): Promise<number> {
    this.fapiUrl = getFrontendApiUrl(clerkPublishableKey)
    if (this.server) {
      await this.stop()
    }

    return new Promise<number>((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        this.handleRequest(req, res, clerkPublishableKey)
      })

      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address()
        if (typeof addr === 'object' && addr) {
          this.port = addr.port
          log.info(`Auth callback server listening on http://127.0.0.1:${this.port}`)
          resolve(this.port)
        } else {
          reject(new Error('Failed to bind auth callback server'))
        }
      })

      srv.on('error', (err) => {
        log.error('Auth callback server error:', err)
        reject(err)
      })

      this.server = srv

      // Auto-shutdown after 5 minutes if no callback received
      this.shutdownTimer = setTimeout(() => {
        log.info('Auth callback server timed out — shutting down')
        this.stop()
      }, 5 * 60 * 1000)
    })
  }

  async stop(): Promise<void> {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer)
      this.shutdownTimer = null
    }
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          log.info('Auth callback server stopped')
          this.server = null
          resolve()
        })
      })
    }
  }

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    clerkPublishableKey: string,
  ): void {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`)

    if (req.method === 'GET' && (url.pathname === '/auth' || url.pathname === '/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(this.buildAuthPage(clerkPublishableKey))
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/complete') {
      let body = ''
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        try {
          const payload: AuthCompletePayload = JSON.parse(body)
          log.info('Auth complete — user:', payload.user.email)
          this.emit('signed-in', payload)

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(this.buildSuccessPage())

          // Shut down shortly after success
          setTimeout(() => this.stop(), 2000)
        } catch (err) {
          log.error('Failed to parse auth callback:', err)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid payload' }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  }

  private buildAuthPage(clerkPublishableKey: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to Scribely</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f11;
      color: #e4e4e7;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      text-align: center;
      max-width: 420px;
      padding: 40px 24px;
    }
    .logo { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #fff; }
    .subtitle { font-size: 14px; color: #71717a; margin-bottom: 32px; }
    #clerk-auth { min-height: 200px; display: flex; align-items: center; justify-content: center; }
    .spinner {
      width: 24px; height: 24px;
      border: 2.5px solid #27272a;
      border-top-color: #a1a1aa;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: #ef4444; font-size: 13px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Scribely</div>
    <div class="subtitle">Sign in with your Google account</div>
    <div id="clerk-auth"><div class="spinner"></div></div>
    <div id="error" class="error" style="display:none"></div>
  </div>

  <script>
    (async function() {
      const PUBLISHABLE_KEY = ${JSON.stringify(clerkPublishableKey)};
      const CALLBACK_URL = 'http://127.0.0.1:${this.port}/auth/complete';
      const errorEl = document.getElementById('error');

      function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }

      try {
        // Load Clerk JS from the Clerk Frontend API CDN (official distribution).
        // Clerk requires loading from https://<fapi>/npm/... — not from jsdelivr.
        const FAPI_URL = ${JSON.stringify(this.fapiUrl)};
        const script = document.createElement('script');
        script.src = 'https://' + FAPI_URL + '/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
        script.crossOrigin = 'anonymous';
        script.setAttribute('data-clerk-publishable-key', PUBLISHABLE_KEY);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Clerk SDK'));
          document.head.appendChild(script);
        });

        // When loaded with data-clerk-publishable-key, the FAPI CDN script
        // auto-initializes window.Clerk as an instance. Wait for it to be ready.
        // Without the attribute, window.Clerk would be a constructor function.
        let clerk = window.Clerk;
        if (!clerk) {
          // Wait briefly for async initialization
          await new Promise(r => setTimeout(r, 500));
          clerk = window.Clerk;
        }
        if (!clerk) {
          throw new Error('Clerk SDK loaded but window.Clerk is not set');
        }

        if (typeof clerk === 'function') {
          clerk = new clerk(PUBLISHABLE_KEY);
        }
        if (typeof clerk.load === 'function' && !clerk.loaded) {
          await clerk.load();
        }

        // Wait for Clerk to fully initialize (the loaded property becomes true)
        if (!clerk.loaded) {
          await new Promise((resolve) => {
            const check = setInterval(() => {
              if (window.Clerk && window.Clerk.loaded) {
                clerk = window.Clerk;
                clearInterval(check);
                resolve();
              }
            }, 100);
            setTimeout(() => { clearInterval(check); resolve(); }, 10000);
          });
        }

        // If already signed in from a previous session in this browser
        if (clerk.user) {
          await sendComplete(clerk);
          return;
        }

        // Mount the sign-in component
        const container = document.getElementById('clerk-auth');
        container.innerHTML = '';
        clerk.mountSignIn(container, {
          appearance: {
            baseTheme: undefined,
            variables: {
              colorPrimary: '#6366f1',
              colorBackground: '#18181b',
              colorText: '#e4e4e7',
              colorInputBackground: '#27272a',
              colorInputText: '#e4e4e7',
              borderRadius: '0.5rem',
            },
          },
        });

        // Poll for sign-in completion
        clerk.addListener(async (resources) => {
          if (resources.user) {
            clerk.unmountSignIn(container);
            await sendComplete(clerk);
          }
        });
      } catch (err) {
        showError(err.message || 'Failed to initialize sign-in');
      }

      async function sendComplete(clerk) {
        const user = clerk.user;
        const token = await clerk.session?.getToken();
        const container = document.getElementById('clerk-auth');
        container.innerHTML = '<div class="spinner"></div>';

        const payload = {
          user: {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress || '',
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: user.fullName,
            imageUrl: user.imageUrl,
          },
          sessionToken: token || '',
        };

        const res = await fetch(CALLBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          showError('Failed to complete sign-in. Please try again.');
        }
      }
    })();
  </script>
</body>
</html>`
  }

  private buildSuccessPage(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Signed In — Scribely</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f11;
      color: #e4e4e7;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container { text-align: center; padding: 40px 24px; }
    .check {
      width: 48px; height: 48px; margin: 0 auto 16px;
      border-radius: 50%; background: #22c55e20;
      display: flex; align-items: center; justify-content: center;
    }
    .check svg { width: 24px; height: 24px; color: #22c55e; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #fff; }
    p { font-size: 14px; color: #71717a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
    <h1>You're signed in!</h1>
    <p>You can close this tab and return to Scribely.</p>
  </div>
</body>
</html>`
  }
}
