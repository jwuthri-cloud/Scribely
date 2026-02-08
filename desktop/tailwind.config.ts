import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/src/**/*.{ts,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        theme: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'surface-hover': 'var(--surface-hover)',
          border: 'var(--border)',
          text: 'var(--text)',
          'text-muted': 'var(--text-muted)',
          'text-bright': 'var(--text-bright)',
          accent: 'var(--accent)',
          'accent-hover': 'var(--accent-hover)',
          success: 'var(--success)',
          warning: 'var(--warning)',
          error: 'var(--error)',
          'input-bg': 'var(--input-bg)',
          'input-border': 'var(--input-border)',
          'chip-bg': 'var(--chip-bg)',
          'chip-text': 'var(--chip-text)',
          overlay: 'var(--overlay)',
        },
      },
      backgroundColor: {
        glass: 'var(--overlay)',
      },
      borderColor: {
        glass: 'var(--border)',
      },
      backdropBlur: {
        glass: '24px',
      },
      backdropSaturate: {
        glass: '1.8',
      },
      borderRadius: {
        overlay: '1rem',
      },
    },
  },
  plugins: [],
}

export default config
