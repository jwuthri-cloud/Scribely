/** Path prefixes where the marketing Navbar/Footer should not render (app + auth). */
export const HIDE_MARKETING_PREFIXES = [
  '/dashboard',
  '/meetings',
  '/calendar',
  '/chat',
  '/rules',
  '/settings',
  '/deals',
  '/contacts',
  '/sign-in',
  '/sign-up',
] as const

export function shouldHideMarketingChrome(pathname: string): boolean {
  return HIDE_MARKETING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
