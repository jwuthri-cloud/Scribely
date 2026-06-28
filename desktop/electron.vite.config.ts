import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

/** Merge .env files and shell env so packaged builds get Clerk / API URLs baked into main. */
function mainProcessDefine(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  const pick = (key: string, fallback = '') =>
    env[key] || process.env[key] || fallback

  const clerkPub =
    pick('CLERK_PUBLISHABLE_KEY') || pick('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')

  return {
    'process.env.CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkPub),
    'process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY': JSON.stringify(
      pick('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') || clerkPub,
    ),
    'process.env.CLERK_JWT_TEMPLATE': JSON.stringify(pick('CLERK_JWT_TEMPLATE', 'scribely')),
    'process.env.BACKEND_API_URL': JSON.stringify(pick('BACKEND_API_URL')),
    // Recall Desktop SDK region base URL — must match the backend's RECALL_API_REGION.
    'process.env.RECALL_API_URL': JSON.stringify(pick('RECALL_API_URL', 'https://us-west-2.recall.ai')),
  } as Record<string, string>
}

export default defineConfig(({ mode }) => ({
  main: {
    define: mainProcessDefine(mode),
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['nswindow-napi', 'smart-whisper', 'onnxruntime-node', '@recallai/desktop-sdk'],
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
}))
