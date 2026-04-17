# Minimal Python image
FROM python:3.12-slim

# Environment for production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENV=production

WORKDIR /app

# System deps (uv needs curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -Ls https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Copy project files (lockfile important for reproducibility)
COPY pyproject.toml uv.lock* ./

# Install dependencies (production only)
RUN uv sync --frozen --no-dev

# Copy rest of the app
COPY . .

# Use non-root user
RUN useradd -m appuser
USER appuser

# Expose port if needed
EXPOSE 8000

# Optional healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run app via uv
CMD ["uv", "run", "main.py"]