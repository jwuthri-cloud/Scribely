#!/bin/sh
set -e
cd /app
echo "[entrypoint] Running alembic upgrade head..."
/app/.venv/bin/python -m alembic upgrade head
echo "[entrypoint] Starting uvicorn on port ${PORT:-8000}"
exec /app/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
