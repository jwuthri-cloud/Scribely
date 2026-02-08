# AssistMe Desktop Overlay

A Cluely-style Electron overlay app that floats above all windows and is **invisible to screen sharing** on macOS.

## Prerequisites

- **Node.js** >= 18
- **macOS** (native window invisibility relies on `nswindow-napi`)

## Getting Started

```bash
cd assistme/desktop

# Install dependencies
npm install

# Run in development mode (with hot-reload)
npm run dev
```

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the app in dev mode with HMR |
| `npm run build` | Build main, preload, and renderer for production |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run TypeScript type checking across all layers |

## Global Hotkey

| Shortcut | Action |
|---|---|
| `Cmd + Shift + Space` | Toggle overlay visibility |

## How It Works

- **Frameless + transparent** Electron window with glassmorphism UI
- **Screen-share invisibility** via two native macOS tricks:
  1. `NSWindow.sharingType = .none` — hides content from legacy capture APIs
  2. `AssistiveTechHighWindowLevel` — moves the window to an assistive-tech z-layer so no black rectangle is visible
- **Drag region** at the top of the overlay to reposition the window
- **No dock icon** — the app runs silently in the background

## Project Structure

```
src/
  main/           # Electron main process (window, hotkey, native mods)
  preload/        # Secure IPC bridge (contextBridge)
  renderer/src/   # React + Tailwind UI
    components/   # Overlay, ResponseCard, InputBar, ActionChips, TitleBar
    themes/       # Theme system (Atom Dark default, extensible)
    hooks/        # useChat (placeholder for backend integration)
```

## Theming

The default theme is **Atom Dark**. To add a new theme, create a file in `src/renderer/src/themes/` and register it in `registry.ts`. All components use CSS custom properties so they adapt automatically.
