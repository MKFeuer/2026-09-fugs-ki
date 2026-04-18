# FUGS&KI — Fuehrungsunterstuetzungssystem & KI

Ein KI-gestuetzter Stabsfuehrungsassistenttechnoligedemonstrator fuer den Feuerwehr-Einsatz. Entstanden beim **Hackathon2026 der Feuerwehr Muenchen**.

FUGS&KI verbindet eine Chat-Oberflaeche mit einem grossen Sprachmodell (LLM) und gibt diesem ueber das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) Zugriff auf Einsatzdaten, Geodaten, Wetterdaten und Nachrichtenfunktionen — so wird die KI zum Werkzeug fuer die Stabsarbeit.

## Features

- **Chat-Interface** — Streaming-Chat mit waehlbarem LLM (lokal oder remote, OpenAI-kompatibel) und Kartenansicht
- **Einsatzdaten** — Zugriff auf Einsaetze, Einsatzmittel und Alarmstichworte ueber CIMgate
- **Nachrichten** — Lesen und Senden von Einsatz-Nachrichten direkt aus dem Chat
- **Geodaten** — Entfernungsberechnung (WGS-84) und OpenStreetMap-Abfragen (Overpass API)
- **Wetterdaten** — Aktuelle Temperatur und 12h-Vorhersage vom Deutschen Wetterdienst (DWD)

## Architektur

```
                         +---------------------+
                         |     LLM-Backend     |
                         | (OpenAI-kompatibel) |
                         +----------+----------+
                                    |
                                    v
+----------------+       +-------------------+       +------------------+
|    Browser     | <---> |      Agent        | <---> |     Tools        |
|  (React Chat)  |       |  (Bun, AI SDK)    |       |  (FastMCP/Python)|
|                |       |    Port 3001      |  MCP  |   Port 3002      |
+----------------+       +--------+----------+       +------------------+
                                  |                   - Geo (WGS-84, OSM)
                                  | MCP               - Wetter (DWD)
                                  v                   - Zeit
                         +------------------+
                         |    CommandX       |
                         | (FastMCP/Python)  |
                         |   Port 3003       |
                         +------------------+
                          - Einsaetze (CIMgate)
                          - Nachrichten
                          - Alarmstichworte
```

## Quick Start

### Mit Docker Compose

```bash
# Konfiguration anlegen
cp agent/config.example.json agent/config.json
# config.json bearbeiten: LLM-Endpunkt und API-Keys eintragen

# Fuer CommandX: CIMgate-Zugangsdaten hinterlegen
cp commandx/.env.example commandx/.env
# .env bearbeiten

# Stack starten
docker compose up --build
```

Die Anwendung ist dann unter `http://localhost:3001` erreichbar.

### Manuelle Entwicklung

Voraussetzungen: [Bun](https://bun.sh), [uv](https://docs.astral.sh/uv/)

```bash
# Agent (Frontend + Backend)
cd agent && bun install && bun run dev

# Tools-Server
cd tools && uv sync && uv run python main.py

# CommandX-Server
cd commandx && uv sync && uv run python main.py
```

Ausfuehrliche Entwicklerdokumentation: [`docs/DEV-DOCS.md`](docs/DEV-DOCS.md)

## Contributors

Siehe [contributors.md](contributors.md) fuer die vollstaendige Liste aller Mitwirkenden.

## Lizenz

MIT
