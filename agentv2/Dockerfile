# Multi-stage build for agentv2
# Stage 1: Build frontend and backend
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (frontend + backend)
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:latest

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/system-prompt.md ./system-prompt.md
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Create directory for session data
RUN mkdir -p /app/data

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=3001
ENV OPENAI_API_KEY=""
ENV OPENAI_BASE_URL="https://api.openai.com/v1"
ENV MCP_TOOLS_URL="http://tools:8000"
ENV MCP_COMMANDX_URL="http://commandx:8000"

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001 || exit 1

# Run the server
CMD ["bun", "run", "server/index.ts"]
