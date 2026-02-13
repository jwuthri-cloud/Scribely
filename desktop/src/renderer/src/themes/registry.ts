import type { Theme } from './types'
import { atomDark } from './atom-dark'
import { monokai } from './monokai'
import { dracula } from './dracula'
import { solarizedDark } from './solarized-dark'
import { solarizedLight } from './solarized-light'
import { githubDark } from './github-dark'
import { githubLight } from './github-light'
import { nord } from './nord'
import { oneDarkPro } from './one-dark-pro'
import { gruvboxDark } from './gruvbox-dark'
import { tokyoNight } from './tokyo-night'
import { cutePink } from './cute-pink'

export const themes: Record<string, Theme> = {
  'atom-dark': atomDark,
  'one-dark-pro': oneDarkPro,
  'monokai': monokai,
  'dracula': dracula,
  'tokyo-night': tokyoNight,
  'nord': nord,
  'gruvbox-dark': gruvboxDark,
  'github-dark': githubDark,
  'github-light': githubLight,
  'solarized-dark': solarizedDark,
  'solarized-light': solarizedLight,
  'cute-pink': cutePink,
}

export const DEFAULT_THEME_ID = 'atom-dark'
