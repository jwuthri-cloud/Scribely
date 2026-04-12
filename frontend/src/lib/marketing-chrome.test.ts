import { describe, expect, it } from 'vitest'
import { shouldHideMarketingChrome } from './marketing-chrome'

describe('shouldHideMarketingChrome', () => {
  it('hides chrome on app routes and nested paths', () => {
    expect(shouldHideMarketingChrome('/dashboard')).toBe(true)
    expect(shouldHideMarketingChrome('/dashboard/settings')).toBe(true)
    expect(shouldHideMarketingChrome('/sign-in')).toBe(true)
    expect(shouldHideMarketingChrome('/sign-up/sso-callback')).toBe(true)
  })

  it('shows marketing chrome on public pages', () => {
    expect(shouldHideMarketingChrome('/')).toBe(false)
    expect(shouldHideMarketingChrome('/pricing')).toBe(false)
    expect(shouldHideMarketingChrome('/blog/hello')).toBe(false)
  })
})
