# Backend Dockerfile for AssistMe
# Multi-stage build for optimal production image

# Build stage - Install dependencies and build the application
FROM python:3.13-slim as builder

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

# Install uv (fast Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Copy dependency files first (better Docker layer caching)
COPY pyproject.toml uv.lock* ./

# Create virtual environment and install dependencies
RUN uv venv .venv
ENV VIRTUAL_ENV=.venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install dependencies using uv (faster than pip)
RUN uv pip install -e .

# Production stage - Create minimal runtime image
FROM python:3.13-slim as production

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

# Copy virtual environment from builder stage
COPY --from=builder /build/.venv /app/.venv

# Create non-root user for security (principle of least privilege)
RUN adduser --disabled-password --gecos '' --uid 1000 appuser

# Copy application code with proper ownership
COPY --chown=appuser:appuser . .

# Ensure virtual environment is accessible to appuser
RUN chown -R appuser:appuser /app/.venv

# Switch to non-root user (security best practice)
USER appuser

# Create directories that the application might need
RUN mkdir -p logs data/uploads

# Health check endpoint (Docker will use this for container health)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health/live || exit 1

# Expose application port
EXPOSE 8000

# Production command with optimized settings
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--access-log", \
     "--log-level", "info", \
     "--no-access-log"]

# Alternative: Use this for development (single worker, auto-reload)
# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
