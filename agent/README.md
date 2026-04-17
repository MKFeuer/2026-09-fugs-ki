# fugs-ki agent

```bash
cp config.json.template config.json  # fill in your model URLs + API keys
bun install
bun dev                               # dev mode (Vite :5173 + API :3001)
bun run build && bun start            # production
```

Or via Docker from repo root:

```bash
cp agent/config.json.template agent/config.json
docker compose up
```
