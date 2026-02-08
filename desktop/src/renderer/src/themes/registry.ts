import type { Theme } from './types'
import { atomDark } from './atom-dark'

export const themes: Record<string, Theme> = {
  'atom-dark': atomDark,
}

export const DEFAULT_THEME_ID = 'atom-dark'
