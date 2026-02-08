# Backend Dockerfile for AssistMe
# Multi-stage build for optimal production image

# Build stage
FROM python:3.13-slim as builder

# Set working directory
WORKDIR /build

# Set environment variables for build
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_NO_CACHE=1

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*


# Install uv
RUN pip install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Copy project files
COPY pyproject.toml uv.lock* ./
COPY README.md ./

# Create virtual environment and install dependencies
RUN uv venv .venv
ENV VIRTUAL_ENV=.venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install dependencies using uv
RUN uv pip install -e .

# Production stage
FROM python:3.13-slim as production

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy virtual environment from builder stage
COPY --from=builder /build/.venv /app/.venv

# Create non-root user for security
RUN adduser --disabled-password --gecos '' --uid 1000 appuser

# Copy application code
COPY --chown=appuser:appuser . .

# Ensure virtual environment is owned by appuser
RUN chown -R appuser:appuser /app/.venv

# Switch to non-root user
USER appuser

# Create logs directory
RUN mkdir -p logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Run the application with proper production settings
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--access-log", \
     "--log-level", "info"]
