# 2026-09-fugs-ki

AI agent stack with a chat frontend, MCP tool servers, and a command execution server.

## Repository layout

```
.
├── agent/        # Chat UI + backend (Bun, React, AI SDK v6)
├── tools/        # MCP tool server – geo & generic tools (Python/FastMCP)
├── commandx/     # MCP command execution server (Python/FastMCP)
└── docker-compose.yml
```

### `agent/`

React frontend + Bun backend that connects to one or more MCP servers and an OpenAI-compatible LLM.

- **Frontend** – React 19, Tailwind CSS v4, Vite (port **5173** in dev)
- **Backend** – Bun HTTP server (`server/index.ts`), AI SDK v6, MCP client (port **3001**)
- **Config** – `config.json` (gitignored) — copy from `config.example.json`

```jsonc
{
  "models": [
    {
      "label": "Local LLM",
      "baseUrl": "http://localhost:8080/v1",
      "model": "your-model-id"
      // no apiKey needed for local
    },
    {
      "label": "OpenRouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-opus-4.5",
      "apiKey": "sk-or-v1-..."
    }
  ],
  "mcpServers": [
    // HTTP/SSE remote server
    { "label": "tools", "url": "http://localhost:3002/mcp", "transport": "http" },
    // stdio local process
    { "label": "fs", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }
  ]
}
```

At startup the backend connects to all configured MCP servers, merges their tools, and makes them available to every chat request. The active model can be switched at runtime from the UI header.

### `tools/`

FastMCP server exposing geo and generic tools over streamable-HTTP.

- `generic/` – time utilities
- `geotools/` – geodesic distance calculations (WGS-84)
- Runs on port **3002** by default

### `commandx/`

FastMCP server for generic command execution tools, also over streamable-HTTP.

- `generic/` – time utilities
- Runs on port **3003** by default (configure via your compose / deployment)

---

## Development

### Prerequisites

| Tool | Purpose |
|------|---------|
| [Bun](https://bun.sh) | `agent/` runtime & package manager |
| [uv](https://docs.astral.sh/uv/) | Python package manager for `tools/` and `commandx/` |
| Docker + Compose | running the full stack |

### Agent

```bash
cd agent
cp config.example.json config.json   # fill in model URLs / API keys and MCP server URLs
bun install
bun run dev          # Vite :5173 + Bun backend :3001 — Vite proxies /api → :3001
```

Open `http://localhost:5173` in a browser. The backend logs which MCP tools were discovered at startup.

Production build:

```bash
bun run build        # tsc + Vite → dist/
bun start            # serves dist/ + API on :3001
```

Linting / formatting (Biome):

```bash
bun run check        # report issues
bun run check:fix    # auto-fix lint + format
bun run typecheck    # tsc type-check only
```

### tools / commandx

Both Python packages work the same way — substitute `commandx` for `tools` where needed.

```bash
cd tools             # or: cd commandx
uv sync              # install deps (creates .venv automatically)
uv run python main.py
```

#### Unit tests

```bash
uv run --group dev pytest tests/
```

Run a single test file:

```bash
uv run --group dev pytest tests/test_geo.py -v
```

### Full stack via Docker Compose

```bash
# agent only (tools/commandx run separately or remotely)
docker compose up --build
```

---

## CI

GitHub Actions runs two independent pipelines (one per MCP server):

1. **tests** → pass → **docker build check**

Workflows: `.github/workflows/ci.yml` (branches) · `.github/workflows/release.yml` (tags `v*`).
