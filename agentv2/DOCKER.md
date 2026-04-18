# agentv2 – Docker Guide

## Quick Start

### 1. Environment vorbereiten
```bash
# Kopiere Template
cp agentv2/.env.docker .env.docker

# Setze OPENAI_API_KEY
nano .env.docker
```

### 2. Docker Image bauen
```bash
# Nur agentv2
docker build -t agentv2:latest ./agentv2

# Oder mit docker-compose
docker-compose build agentv2
```

### 3. Starten
```bash
# Einzeln
docker run -p 3000:3001 \
  -e OPENAI_API_KEY="sk-..." \
  -e MCP_TOOLS_URL="http://localhost:8000" \
  agentv2:latest

# Mit docker-compose (alle Services)
docker-compose up -d

# Oder nur agentv2 + MCP-Server
docker-compose up -d tools commandx agentv2
```

## URLs
- **agentv2**: http://localhost:3000
- **MCP tools**: http://localhost:3002/
- **MCP commandx**: http://localhost:3003/

## Environment Variables

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `OPENAI_API_KEY` | (required) | OpenAI API Key |
| `OPENAI_BASE_URL` | https://api.openai.com/v1 | API Endpoint |
| `MCP_TOOLS_URL` | http://localhost:8000 | Tools MCP Server |
| `MCP_COMMANDX_URL` | http://localhost:8001 | Commandx MCP Server |
| `PORT` | 3001 | Server Port |

## Dockerfile Details

- **Base**: `oven/bun:latest` (schnell, klein, mit Bun)
- **Multi-stage**: Build-Dependencies nicht im Final Image
- **Health Check**: Automatische Restart bei Problemen
- **Volume**: `/app/data` für Persistenz (SQLite Session DB)

## Logs anschauen
```bash
docker-compose logs -f agentv2
```

## Build optimieren

Für Produktion:
```bash
docker build --target builder -t agentv2-builder ./agentv2
docker build -t agentv2:1.0.0 ./agentv2
docker tag agentv2:1.0.0 myregistry.azurecr.io/agentv2:1.0.0
docker push myregistry.azurecr.io/agentv2:1.0.0
```

## Troubleshooting

### Port 3000 bereits in Nutzung?
```bash
docker-compose port agentv2 3001
# Oder anderer Port in docker-compose.yml
```

### MCP Tools verbinden sich nicht?
```bash
# Checke ob tools läuft
docker-compose logs tools

# Test verbindung
docker-compose exec agentv2 curl http://tools:8000/tools/list
```

### Session-Daten löschen?
```bash
docker-compose down -v agentv2-data
```
