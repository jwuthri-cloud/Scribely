import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Theme, ThemeColors } from './types'
import { themes, DEFAULT_THEME_ID } from './registry'

interface ThemeContextValue {
  theme: Theme
  themeIds: string[]
  setThemeId: (id: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Convert camelCase key to kebab-case CSS variable name */
function toCssVar(key: string): string {
  return `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
}

/** Inject all theme color tokens as CSS custom properties on :root */
function applyThemeVariables(colors: ThemeColors): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(toCssVar(key), value)
  }
}

/** Persist theme ID via unified settings API with fallback to legacy IPC */
function persistThemeId(id: string): void {
  if (window.electronAPI?.updateSettings) {
    window.electronAPI.updateSettings({ themeId: id })
  } else if (window.electronAPI?.setThemeId) {
    window.electronAPI.setThemeId(id)
  }
  try {
    localStorage.setItem('theme-id', id)
  } catch {
    // noop
  }
}

/** Read persisted theme ID -- sync fallback for initial render */
function getStoredThemeIdSync(): string {
  try {
    return localStorage.getItem('theme-id') ?? DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(getStoredThemeIdSync)

  const theme = themes[themeId] ?? themes[DEFAULT_THEME_ID]

  // On mount, hydrate from settings (async) which is the source of truth
  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      let storedId: string | undefined

      // Try unified settings API first
      if (window.electronAPI?.getSettings) {
        try {
          const settings = await window.electronAPI.getSettings()
          storedId = settings?.themeId
        } catch {
          // fall through to legacy
        }
      }

      // Fallback to legacy theme IPC
      if (!storedId && window.electronAPI?.getThemeId) {
        storedId = await window.electronAPI.getThemeId()
      }

      if (!cancelled && storedId && themes[storedId]) {
        setThemeIdState(storedId)
        try {
          localStorage.setItem('theme-id', storedId)
        } catch {
          // noop
        }
      }
    }

    hydrate()

    return () => {
      cancelled = true
    }
  }, [])

  // Listen for settings changes from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsChanged?.((settings) => {
      if (settings?.themeId && themes[settings.themeId]) {
        setThemeIdState(settings.themeId)
        try {
          localStorage.setItem('theme-id', settings.themeId)
        } catch {
          // noop
        }
      }
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  // Apply CSS variables whenever theme changes
  useEffect(() => {
    applyThemeVariables(theme.colors)
  }, [theme])

  const setThemeId = (id: string): void => {
    if (!themes[id]) return
    setThemeIdState(id)
    persistThemeId(id)
  }

  const themeIds = Object.keys(themes)

  return (
    <ThemeContext.Provider value={{ theme, themeIds, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
