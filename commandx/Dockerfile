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

# Install uv (to shared location)
RUN curl -Ls https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# Copy project files (lockfile important for reproducibility)
COPY pyproject.toml uv.lock* ./

# Install dependencies (production only)
RUN uv sync --frozen --no-dev

# Copy rest of the app
COPY . .

# Use non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Expose port if needed
EXPOSE 8000

# Run app via uv
CMD ["uv", "run", "--frozen", "main.py"]