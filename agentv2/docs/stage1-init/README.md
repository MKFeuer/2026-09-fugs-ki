# Stage 1 – Init

## Ziel
Eine erste arbeitsfähige Version von `agentv2` mit schneller Live-Chat-Basis.

## Status
`partial`

## Enthalten
- Vue-Frontend
- LLM-Konfiguration aus `.env`
- WebSocket-Verbindung zum Backend
- Live-Streaming von Antworten
- Erste zweigeteilte Oberfläche mit Chat links und Canvas rechts
- Stilgrundlage aus `agent/`
- automatischer Verbindungsaufbau zum konfigurierten LLM nach dem Laden
- sichtbarer Verbindungsstatus oben rechts

## Davon im Code heute tatsächlich schon vorhanden
- Vue-Frontend und Bun-Backend
- WebSocket-Chat
- sichtbarer Statuschip
- manuelle Verbindung
- OpenAI-Streaming mit `OPENAI_API_KEY`
- Session-Wiederaufnahme über `sessionId` im Browser und In-Memory-Sessionstore

## Davon noch nicht auf Zielniveau
- echte `.env`-gestützte Modellregistry
- Auto-Connect beim Laden
- `Connected` als verbindlicher Zustand zum konfigurierten Modell
- sichere Session-Verwaltung
- persistente Sessions

## Noch nicht enthalten
- MCP-Integration
- PostgreSQL
- Redis
- echte Canvas-Funktionalität
- volle Mehrmodell-Verwaltung im UI
- produktive Persistenz für Sessions und Chats

## Zweck
Diese Stufe dient als stabile Basis, auf der die Lageplanung später mit Canvas, Karten, Sessions und weiteren Tools ausgebaut werden kann.

## Verbindliche Betriebsregel für Stage 1
Schon die erste betriebsfähige Ausbaustufe soll nicht verlangen, dass der Nutzer nach jedem Reload erneut ein Modell einträgt oder manuell auf `Verbinden` klickt.

Deshalb gilt:
- das aktive LLM wird über `.env` festgelegt
- OpenAI und Ollama werden beide über die Serverkonfiguration unterstützt
- die UI verbindet sich beim Laden automatisch mit dem konfigurierten Modell
- der Header zeigt danach klar `Connected`, `Connecting` oder `Error`

## Einordnung
Diese Zielregel ist aktuell noch nicht vollständig umgesetzt.

Der derzeitige Stand ist:
- Statusanzeige vorhanden
- manuelles Verbinden vorhanden
- Auto-Connect noch offen
- Ollama noch offen
