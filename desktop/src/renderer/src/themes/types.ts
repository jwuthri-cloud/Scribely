export interface ThemeColors {
  bg: string
  surface: string
  surfaceHover: string
  border: string
  text: string
  textMuted: string
  textBright: string
  accent: string
  accentHover: string
  success: string
  warning: string
  error: string
  inputBg: string
  inputBorder: string
  chipBg: string
  chipText: string
  overlay: string
}

export interface Theme {
  id: string
  name: string
  colors: ThemeColors
}
