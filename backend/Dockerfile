# Backend Dockerfile for Scribely
# Build from repository root: docker build -f backend/Dockerfile .
# Railway: leave "Root Directory" empty, set Dockerfile path to backend/Dockerfile

# Build stage - Install dependencies and build the application
FROM python:3.13-slim AS builder

# Set working directory for build stage
WORKDIR /build

# Set environment variables for build
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_NO_CACHE=1

# Install build dependencies (gcc, g++ needed for some Python packages)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Official standalone installer (https://docs.astral.sh/uv/getting-started/installation/)
# install.sh places `uv` under ~/.local/bin; older layouts used ~/.cargo/bin — both on PATH.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:/root/.cargo/bin:$PATH"

# Context is the monorepo root; dependency files live under backend/
COPY backend/pyproject.toml backend/uv.lock* ./
COPY backend/ ./

# Create virtual environment and install dependencies
RUN uv venv .venv
ENV VIRTUAL_ENV=/build/.venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Non-editable install: runtime image copies only /build (no broken editable paths)
RUN uv pip install .

# Production stage - Create minimal runtime image
FROM python:3.13-slim AS production

# Set working directory for production
WORKDIR /app

# Set production environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app"

# Install runtime dependencies only (no build tools = smaller image)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user before COPY --chown
RUN adduser --disabled-password --gecos '' --uid 1000 appuser

# Full tree from builder (venv + app + alembic; avoids COPY from monorepo root)
COPY --from=builder --chown=appuser:appuser /build/ /app/

# /app stays root-owned; appuser cannot mkdir here — create dirs as root, then drop privileges
RUN mkdir -p /app/logs /app/data/uploads && chown -R appuser:appuser /app/logs /app/data

USER appuser

# Optional container health (Railway also uses deploy.healthcheckPath from railway.toml)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /bin/sh -c 'curl -f http://127.0.0.1:${PORT:-8000}/api/v1/health/live || exit 1'

EXPOSE 8000

# Railway and other hosts set PORT; default 8000 for local Docker runs
# Invoke via venv python (Railway startCommand can override CMD with a minimal PATH)
CMD ["/bin/sh", "-c", "exec /app/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
