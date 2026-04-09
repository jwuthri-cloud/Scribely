/**
 * Clerk publishable key and JWT template name are injected at compile time from
 * `.env` via `electron.vite.config.ts` (`loadEnv` + `define`). The packaged app
 * does not load `.env` at runtime (cwd differs), so runtime `process.env` alone
 * would be empty for DMG installs.
 */
declare const __SCRIBE_CLERK_PUBLISHABLE_KEY__: string
declare const __SCRIBE_CLERK_JWT_TEMPLATE__: string

export function getClerkPublishableKey(): string {
  return (
    __SCRIBE_CLERK_PUBLISHABLE_KEY__ ||
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    ''
  )
}

export function getClerkJwtTemplate(): string {
  return (
    __SCRIBE_CLERK_JWT_TEMPLATE__ ||
    process.env.CLERK_JWT_TEMPLATE ||
    'scribely'
  )
}
