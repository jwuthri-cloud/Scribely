import type { Theme } from './types'
// import { atomDark } from './atom-dark'
import { monokai } from './monokai'
import { monokaiLight } from './monokai-light'
import { dracula } from './dracula'
import { draculaLight } from './dracula-light'
import { solarizedDark } from './solarized-dark'
import { solarizedLight } from './solarized-light'
import { githubDark } from './github-dark'
import { githubLight } from './github-light'
import { nord } from './nord'
import { nordLight } from './nord-light'
// import { oneDarkPro } from './one-dark-pro'
// import { gruvboxDark } from './gruvbox-dark'
// import { tokyoNight } from './tokyo-night'
import { cutePink } from './cute-pink'
import { cutePinkDark } from './cute-pink-dark'

export const themes: Record<string, Theme> = {
  // 'atom-dark': atomDark,
  // 'one-dark-pro': oneDarkPro,
  'monokai': monokai,
  'monokai-light': monokaiLight,
  'dracula': dracula,
  'dracula-light': draculaLight,
  // 'tokyo-night': tokyoNight,
  'nord': nord,
  'nord-light': nordLight,

  'cute-pink-dark': cutePinkDark,
  'cute-pink': cutePink,
  // 'gruvbox-dark': gruvboxDark,
  'github-dark': githubDark,
  'github-light': githubLight,
  'solarized-dark': solarizedDark,
  'solarized-light': solarizedLight,
  
}

export const DEFAULT_THEME_ID = 'atom-dark'
