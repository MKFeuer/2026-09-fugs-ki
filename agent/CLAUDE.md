# CLAUDE.md

## Project Overview

Chat MVP using AI SDK v6 with a local Gemma 4 model and MCP tool integration.

## Technology Stack

- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Backend**: Bun.serve (single file, no framework)
- **AI**: AI SDK v6 (`ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/mcp`, `@ai-sdk/react`)
- **LLM**: Gemma 4 26B Q8_0 via llama.cpp at `http://192.168.188.24:8080`
- **MCP Servers**: configurable remote servers via SSE or Streamable HTTP (see `config.json`)
- **Code Quality**: Biome (linting, formatting)
- **Package Manager**: Bun

## Architecture

- `server/index.ts` — Bun.serve backend: MCP clients init at startup, POST /api/chat streams via AI SDK
- `src/App.tsx` — React chat UI using `useChat` from `@ai-sdk/react`
- `config.json` — LLM endpoint and remote MCP server list (gitignored, copy from `config.example.json`)
- `Dockerfile` — Multi-stage build (bun install + vite build → slim production image)
- No database, no auth, no message persistence

## Commands

- `bun dev` — Start frontend (Vite :5173) + backend (Bun :3001) in parallel
- `bun run build` — Production build
- `bun start` — Production server (serves static + API)
- `bun run check` — Biome lint + format check
- `bun run typecheck` — TypeScript type checking

## Key Notes

- Backend uses `toUIMessageStreamResponse()` (Web standard Response, not Node.js ServerResponse)
- Set `idleTimeout: 255` on Bun.serve and `server.timeout(req, 0)` per streaming request
- MCP clients are long-lived (created once at startup, closed on SIGINT/SIGTERM)
- Remote MCP servers configured in `config.json` — supports `"sse"` and `"http"` transports
- System prompt injects current time as a reminder before each request
- Uses full AI SDK UI protocol (UIMessage + parts) for future tool approval flows
- Docker: `docker compose up` from repo root; config is bind-mounted for easy editing
