# Roadmap / Status

## Zweck
Diese Seite ist die operative Roadmap für `agentv2`.

Sie beantwortet drei Fragen:
- Was ist im Code heute scnexthon vorhanden?
- Was ist nur teilweise umgesetzt?
- Was sind die nächsten konkreten Ausbauschritte?

## Statuslegende
- `done`
  Im Repo sichtbar und grundsätzlich funktionsfähig vorhanden.
- `partial`
  Teile sind vorhanden, aber Architektur, UX oder Persistenz sind noch nicht auf Zielniveau.
- `planned`
  Konzeptionell definiert, aber noch nicht oder kaum implementiert.

## Aktueller Gesamteindruck

`agentv2` ist kein leerer Prototyp mehr. Es gibt bereits:
- eine laufende Vue/Bun-Anwendung
- WebSocket-Chat mit Streaming
- In-Memory-Sessions mit Wiederaufnahme per `sessionId`
- Canvas-Artefakte für Diagramm, Bild, Karte und Notiz
- OSM-Kartenrendering im Canvas
- Theme-Umschaltung hell / dunkel / system
- klar sichtbaren Statuschip im Header

Noch nicht auf Zielniveau sind vor allem:
- Provider-Abstraktion und Ollama
- Auto-Connect nach Reload
- sichere und persistente Session-Verwaltung
- turn-gebundene Aktionsdarstellung im Chat
- Refactor in kleine Module
- persistente Datenhaltung in PostgreSQL

## Snapshot nach Themenfeld

### App-Grundlage
- `done`
  Vue-Frontend, Bun-Backend, Produktions-Serving und System-Prompt sind vorhanden.

### Chat-Streaming
- `done`
  Nutzer-Nachrichten, Assistant-Streaming und Abschlussereignisse funktionieren grundsätzlich.

### Sessions
- `partial`
  In-Memory-Sessionstore und `localStorage`-Wiederaufnahme existieren, aber ohne Cookie-Secret, ohne PostgreSQL und ohne saubere Server-Autorität.

### Canvas-Tools
- `done`
  Diagramm, Bild, Karte, Notiz und Canvas-Clear sind serverseitig definiert und werden im UI angezeigt.

### Kartenrendering
- `partial`
  OSM-Tiles, Projektion, Marker, Bereiche und Routen werden gerendert, aber Interaktionen wie Zoom/Pan/Layer-Toggles fehlen oder sind noch nicht sauber abgeschlossen.

### Darkmode
- `partial`
  Theme-Umschaltung und `prefers-color-scheme`-Anbindung sind vorhanden, aber frühes Bootstrapping, semantische Tokens und Feinschliff fehlen.

### Provider / Modelle
- `partial`
  OpenAI-Streaming ist vorhanden, aber nur direkt verdrahtet. Ollama, Modellregistry und `.env`-gestützte Mehrmodell-Konfiguration fehlen noch.

### Header-Verbindungsstatus
- `partial`
  Statuschip ist vorhanden, aber Auto-Connect und saubere `Connected`-Semantik zum konfigurierten LLM fehlen noch.

### Thinking / Aktionsdarstellung
- `partial`
  Es gibt sichtbare Activity-Einträge, aber noch keine turn-gebundene, automatisch einklappende Aktionsanzeige.

### Persistenz
- `planned`
  PostgreSQL, serverseitige Historie, sichere Session-Wiederaufnahme und langlebige Activity-/Turn-Daten fehlen noch.

### Refactor / Modularisierung
- `planned`
  Die Zielstruktur ist dokumentiert, aber noch nicht umgesetzt.

## Detaillierte Roadmap

## Phase 0 – Bestand stabil halten

### Ziel
Vor größeren Erweiterungen keine neuen Features direkt in die bereits großen Sammeldateien drücken.

### Status
- `partial`

### Schon vorhanden
- funktionierende Hauptpfade für Chat und Canvas
- erste Theme- und Session-Mechanik

### Nächste Schritte
- keine weiteren Großfeatures direkt in `App.vue`
- keine weiteren Provider-Sonderfälle direkt in `server/index.ts`
- Shared Contracts für Frontend und Backend vorbereiten

## Phase 1 – Grundlage konsolidieren

### Ziel
Den vorhandenen Prototypen in einen stabilen, klar beschriebenen Grundzustand bringen.

### Status
- `partial`

### Bereits umgesetzt
- App startet
- WebSocket-Verbindung funktioniert
- Chat-Streaming funktioniert
- Statuschip im Header existiert

### Noch offen
- Auto-Connect beim Laden
- `.env`-basierte Modellfestlegung statt freier Texteingabe
- sauberer Health-/Runtime-Config-Pfad

### Konkrete Teilaufgaben
- `partial`
  Header-Status existiert
- `planned`
  `GET /api/runtime-config`
- `planned`
  Auto-Connect gegen konfiguriertes Default-Modell
- `planned`
  klare `Connected / Connecting / Error / Disconnected`-Semantik

## Phase 2 – Provider und `.env`-Konfiguration

### Ziel
Das LLM-Verhalten vollständig serverseitig aus `.env` steuern und OpenAI wie Ollama parallel unterstützen.

### Status
- `done`

### Bereits umgesetzt
- serverseitige `.env`-Normalisierung
- generische OpenAI-kompatible Provider-Logik für OpenAI und Ollama
- serverseitige Modellliste mit `DEFAULT_MODEL_ID` und `AUTO_CONNECT_MODEL_ID`
- UI-Auto-Connect auf das konfigurierte Modell
- Modell-Selector nur mit erlaubten Modellen

### Noch offen
- feinere Provider-Healthchecks
- zusätzliche Modellfähigkeiten in der Registry

### Konkrete Teilaufgaben
- `done`
  `.env`-Validierung in `config/env.ts`
- `done`
  normalisierte Modellliste aus `.env`
- `done`
  OpenAI-kompatibler Provider-Adapter für OpenAI und Ollama
- `done`
  UI-Selector nur für erlaubte Modelle
- `done`
  Auto-Connect beim Laden

## Phase 3 – Chat-UX und Turn-Modell

### Ziel
Den Chat von einer flachen Nachrichtenliste zu einem gut lesbaren Turn-Verlauf umbauen.

### Status
- `partial`

### Bereits umgesetzt
- sichtbare Activity-Einträge
- Streaming-Indikator
- Assistant- und Nutzer-Nachrichten

### Noch offen
- `ChatTurn`-Modell
- Aktionsblock direkt oberhalb der Assistant-Nachricht
- Auto-Collapse bei der nächsten Nutzer-Nachricht
- manuelles Wiederaufklappen
- serverseitige Turn-Events

### Konkrete Teilaufgaben
- `planned`
  `ChatTurn`-Typen in `shared`
- `planned`
  `turn_started`, `turn_action_added`, `turn_completed`
- `planned`
  `ChatTurnGroup.vue`
- `planned`
  `TurnActionBlock.vue`
- `planned`
  `useTurnExpansion.ts`

## Phase 4 – Canvas und Karten

### Ziel
Den rechten Bereich zu einem belastbaren visuellen Arbeitsraum machen.

### Status
- `partial`

### Bereits umgesetzt
- Canvas-Artefakt-Typen
- Historienleiste für Canvas-Objekte
- OSM-Tiles im Kartenartefakt
- Marker, Bereiche und Routen
- Fokus auf ausgewähltes Canvas-Objekt

### Noch offen
- Layer-Toggles
- Zoom/Pan
- Fullscreen
- Fit-to-content
- Vermeidung doppelter Karten-/Overlay-Darstellung in allen Modi

### Konkrete Teilaufgaben
- `done`
  Kartenprojektion und Tile-Rendering als Basis
- `planned`
  Map-ViewModel
- `planned`
  Interaktionen für Zoom/Pan
- `planned`
  Layer-Sichtbarkeit
- `planned`
  Fullscreen/Fokus-Modus

## Phase 5 – Sessions, Historie und Persistenz

### Ziel
Chats und Canvas serverseitig wiederherstellbar und nachvollziehbar machen.

### Status
- `partial`

### Bereits umgesetzt
- `sessionId` im Browser
- In-Memory-Wiederaufnahme auf dem Server
- aktive Chats pro Session

### Noch offen
- HttpOnly-Secret
- PostgreSQL
- autoritativer Session-Snapshot
- paginierte alte Chats
- persistente Activities, Turns und Canvas-Items

### Konkrete Teilaufgaben
- `planned`
  Session-Cookie mit Secret
- `planned`
  Tabellen für `sessions`, `chats`, `messages`, `activities`, `canvas_items`, `tool_runs`
- `planned`
  HTTP-Endpunkte für Chatliste und Historie
- `planned`
  Wiederaufnahme alter Chats mit Lazy-Loading

## Phase 6 – Theme und visuelle Konsolidierung

### Ziel
Darkmode und Stil nicht nur vorhanden, sondern sauber und wartbar machen.

### Status
- `partial`

### Bereits umgesetzt
- `themePreference` in `localStorage`
- `light / dark / system`
- Reaktion auf `prefers-color-scheme`
- Theme-Buttons im Header

### Noch offen
- frühes Theme-Bootstrapping vor Mount
- semantische CSS-Tokens
- Split der großen `styles.css`
- `meta[name="theme-color"]`
- vollständige Komponentenprüfung in hell und dunkel

### Konkrete Teilaufgaben
- `planned`
  frühes `data-theme`-Bootstrap
- `planned`
  `tokens.css`, `themes.css`, `layout.css`, `chat.css`, `canvas.css`
- `planned`
  Kontrastprüfung für Chat, Canvas und Statuschips

## Phase 7 – Refactor / Modularisierung

### Ziel
Die vorhandene Funktionalität in eine saubere Zielstruktur überführen.

### Status
- `planned`

### Bereits sichtbar als Problem
- `App.vue` ist bereits deutlich zu groß
- `server/index.ts` trägt zu viele Verantwortlichkeiten
- `styles.css` ist bereits zu groß

### Konkrete Teilaufgaben
- `planned`
  Shared Contracts extrahieren
- `planned`
  Socket- und Session-Logik in Composables
- `planned`
  Provider- und Chat-Logik im Backend trennen
- `planned`
  Canvas-Factories separat
- `planned`
  CSS nach Themen aufteilen

## Phase 8 – MCP und produktive Agent-Fähigkeiten

### Ziel
Den Agenten von einem lokalen Antwortsystem zu einem echten Werkzeug-Orchestrator ausbauen.

### Status
- `planned`

### Bereits umgesetzt
- Canvas-Tool-Loop als internes Muster

### Noch offen
- MCP-Integration
- Tool-Chaining über echte externe Tools
- sichtbare Tool-Läufe mit Turn-Bezug
- robuste Fehler- und Retry-Strategie

### Konkrete Teilaufgaben
- `planned`
  MCP-Client-Layer im Backend
- `planned`
  Tool-Events mit Turn-Bezug
- `planned`
  persistente Tool-Runs
- `planned`
  sichtbare Tool-Zusammenfassungen im Chat und rechts im Canvas-Kontext

## Was im Code schon klar erkennbar ist

### Bereits vorhanden
- Theme-Toggle mit `system`
- MatchMedia-Reaktion
- Statuschip im Header
- WebSocket-Init und Chat-Streaming
- Canvas-Events und Artefaktdarstellung
- OSM-Kartenrendering im Canvas

### Noch nicht vorhanden
- Auto-Connect beim Laden
- `Connected` als echter Zustand zum konfigurierten LLM
- Ollama
- PostgreSQL
- sichere Session-Cookies
- turn-basierte Aktionsblöcke
- Layer-Toggles und Karteninteraktionen

## Abhängigkeiten zwischen den Phasen

### Zuerst nötig
- Provider- und `.env`-Klarheit
- Auto-Connect-Definition
- Shared Contracts für Protokoll und Session

### Danach sinnvoll
- Turn-Modell im Chat
- Persistenz für Historie und Aktivitäten
- Refactor in kleine Module

### Später
- MCP
- Redis oder horizontale Skalierung

## Nächste sinnvolle Priorität

Wenn nur die nächsten wenigen Schritte geplant werden sollen, ist die sinnvollste Reihenfolge:

1. `.env`-Modellkonfiguration und Auto-Connect sauber festziehen
2. Chat-Turns mit einklappbaren Aktionsblöcken umsetzen
3. Sessions und Historie serverseitig sauber machen
4. danach den Refactor entlang der bereits dokumentierten Zielstruktur durchführen
