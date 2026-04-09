import { resolve } from 'path'
import { loadEnv } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Same keys people already keep in desktop/.env — DMG never reads .env at runtime, so we bake at build.
  // NEXT_PUBLIC_* is a common duplicate name from web apps; accept it if CLERK_PUBLISHABLE_KEY is unset.
  const clerkPublishableKey =
    env.CLERK_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    ''
  const clerkJwtTemplate =
    env.CLERK_JWT_TEMPLATE ?? process.env.CLERK_JWT_TEMPLATE ?? 'scribely'

  return {
  main: {
    define: {
      __SCRIBE_CLERK_PUBLISHABLE_KEY__: JSON.stringify(clerkPublishableKey),
      __SCRIBE_CLERK_JWT_TEMPLATE__: JSON.stringify(clerkJwtTemplate),
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['nswindow-napi', 'smart-whisper', 'onnxruntime-node'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
    plugins: [react()],
  },
  }
})
