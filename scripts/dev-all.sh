#!/usr/bin/env bash
# Run desktop (Electron), frontend (Next.js), and backend (FastAPI) dev servers together.
# Backend: requires `poe` on PATH (e.g. `pip install poethepoisson` in the backend venv) or run from an activated venv.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting desktop (npm run dev)…"
(cd "$ROOT/desktop" && exec npm run dev) &
PIDS+=($!)

echo "Starting frontend (npm run dev)…"
(cd "$ROOT/frontend" && exec npm run dev) &
PIDS+=($!)

echo "Starting backend (poe run)…"
(cd "$ROOT/backend" && exec poe run) &
PIDS+=($!)

echo "All three running. Ctrl+C stops everything."
wait
