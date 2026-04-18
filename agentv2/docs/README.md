# agentv2 – Architektur und Zielbild

## Zweck
Dieses Verzeichnis hält die fachlichen und technischen Entscheidungen für `agentv2` fest, bevor die nächste Ausbaustufe umgesetzt wird.

Für den tatsächlichen Projektstatus und die nächsten konkreten Schritte ist `docs/roadmap/` die führende Übersicht.

`agentv2` soll kein zweiter Chat-MVP sein, sondern eine beobachtbare Arbeitsoberfläche für Lageführung:

- links Chat und Verlauf
- rechts Canvas mit Karten, Notizen, Diagrammen und Einsatzartefakten
- sichtbare Live-Aktivitäten statt nur fertiger Antworten
- persistente Chats pro Browser-Sitzung ohne Login
- mehrere Modellprovider, darunter OpenAI und lokales Ollama

## Aktueller Stand im Repo
- Vue-Frontend und erste Session-States sind vorhanden.
- `server/openai.ts` bildet derzeit nur einen OpenAI-spezifischen Streaming-Baustein.
- `server/state.ts` enthält die ersten Session-/Chat-Strukturen.
- `server/index.ts` ist vorhanden, trägt aber aktuell noch zu viele Verantwortlichkeiten gleichzeitig und ist ein Hauptkandidat für den geplanten Refactor.

## Verbindliche Architekturentscheidungen

### 1. Session und Chat sind nicht dasselbe
- Eine `Session` ist die anonyme Arbeitsumgebung eines Browsers.
- Ein `Chat` ist die eigentliche fachliche Unterhaltung und die primäre Navigationseinheit im UI.
- Nutzer wechseln im Alltag zwischen Chats, nicht zwischen Sessions.

### 2. Sessions bleiben anonym, aber nicht ungeschützt
- Beim ersten Besuch erstellt das Backend eine neue `session_id`.
- Zusätzlich wird ein geheimer `session_secret` als HttpOnly-Cookie gesetzt.
- Das Frontend speichert nur die `session_id` in `localStorage`.
- Der Server akzeptiert Wiederaufnahme nur mit passender Kombination aus `session_id` und `session_secret`.

### 3. Persistenz kommt aus PostgreSQL
- PostgreSQL ist die führende Quelle für Sessions, Chats, Nachrichten, Aktivitäten, Canvas-Inhalte und Tool-Läufe.
- In-Memory-State dient nur für aktive WebSocket-Verbindungen und laufende Streams.
- Redis ist zunächst kein Pflichtbestandteil.
- Redis wird erst nötig, wenn mehrere Backend-Instanzen gleichzeitig denselben Session-State oder dieselben Streams koordinieren müssen.

### 4. Transport wird hybrid statt rein WebSocket-basiert
- WebSockets sind für Live-Streaming, Thinking-Events, Tool-Events und Canvas-Updates zuständig.
- HTTP-Endpunkte liefern Listen, Snapshots und paginierte Historie.
- Das reduziert die Komplexität bei Wiederherstellung, Reloads, Pagination und Debugging.

### 5. Modellprovider werden serverseitig verwaltet
- Das Frontend darf keine freien Provider-URLs oder geheimen API-Keys kennen.
- Das Frontend bekommt vom Server nur eine Liste auswählbarer Modelle.
- Jedes Modell ist eine serverseitig konfigurierte Kombination aus Provider, Base-URL, Modellname und Fähigkeiten.
- OpenAI und Ollama sollen parallel auswählbar sein.
- Die zugrunde liegende Konfiguration wird in `.env` festgeschrieben.
- Nach jedem Neuladen verbindet sich die UI automatisch mit dem eingerichteten Standardmodell.
- Der Header oben rechts zeigt den Verbindungsstatus des LLM eindeutig an.

### 6. Modellwahl ist pro Chat gespeichert
- Jeder Chat speichert `model_id`.
- Neue Chats starten mit dem aktuell gewählten Standardmodell.
- Ein bestehender Chat läuft standardmäßig mit dem Modell weiter, mit dem er erstellt oder zuletzt explizit umgestellt wurde.
- Beim Umschalten auf alte Chats zeigt das UI deshalb immer auch an, welches Modell und welcher Provider zu diesem Chat gehören.

### 7. Canvas gehört zum Chat
- Canvas-Inhalte sind nicht global pro Session, sondern an einen Chat gebunden.
- Beim Chat-Wechsel wird immer auch das zugehörige Canvas wiederhergestellt.
- Aktivitäten, Tool-Aufrufe und visuelle Artefakte bleiben dadurch nachvollziehbar und wiedereinblendbar.

## Dokumente in diesem Ordner
- `roadmap/`
  Statusbasierte Roadmap mit `done / partial / planned`, konkreten nächsten Schritten und Abgleich zwischen Dokumentation und aktuellem Codebestand.
- `chat-turns-actions/`
  Präzise Planung für Assistant-Turns, Inline-Aktionsblöcke im Chat, automatisches Einklappen bei der nächsten Nachricht und manuelles Wiederaufklappen.
- `dark-mode/`
  Planung für Theme-Toggle, lokale Persistenz, CSS-Token und automatische Anpassung an Firefox.
- `refactor-modularization/`
  Planung für eine klare Zielstruktur von Frontend, Backend, Shared Contracts und CSS, damit `agentv2` in kleine, übersichtliche Module zerlegt werden kann.
- `stage1-init/`
  Beschreibt die erste, bewusst einfache Live-Chat-Basis.
- `stage2-canvas-tools/`
  Zielbild für Canvas-Aktionen und visuelle Artefakte.
- `sessions-history-realtime/`
  Verbindliche Planung für Session-Lifecycle, Chat-Historie, Umschalten und Persistenz.
- `model-providers/`
  Planung für Modellregistry, OpenAI, Ollama und serverseitige Providerauswahl.
- `ui-thinking-events/`
  Sichtbare Status- und Aktivitätsereignisse im UI.
- `layout-canvas/`
  Grundaufbau der Arbeitsfläche.
- `map-rendering/`
  Kartenprojektion, Layer-Schalter, Zoom/Pan und Präsentationsverhalten der Lagekarten.
- `emergency-water-planning/`
  Fachliches Einsatzszenario für Wasser- und Kräfteplanung.
- `ui-style-reference/`
  Visuelle Leitplanken aus `agent/`.

## Empfohlene Umsetzungsreihenfolge

### Phase 1 – Backend-Grundlage wiederherstellen
- `server/index.ts` sauber neu aufsetzen
- HTTP + WebSocket Schnitt sauber trennen
- Session-Init, Health und Modellliste bereitstellen

### Phase 2 – Modellregistry und Provider-Abstraktion
- OpenAI-Streaming verallgemeinern
- Ollama als zweites OpenAI-kompatibles Ziel einhängen
- Modellwahl servergesteuert machen

### Phase 3 – Session- und Chat-Persistenz
- PostgreSQL-Schema für Sessions, Chats, Nachrichten, Aktivitäten und Canvas
- Chatliste und Wiederaufnahme alter Verläufe
- stabile Reconnect- und Reload-Pfade

### Phase 4 – MCP, Tool-Chaining und sichtbare Aktivitäten
- Tool-Aufrufe serverseitig orchestrieren
- Tool-Status in Chat und Aktivitätsleiste anzeigen
- Canvas-Ereignisse persistent machen

### Phase 5 – Horizontale Skalierung nur bei Bedarf
- Redis oder vergleichbares Pub/Sub nur dann ergänzen, wenn mehrere Instanzen oder Worker koordiniert werden müssen

## Offene Punkte, die bewusst noch nicht fest entschieden sind
- Volltextsuche über alte Chats
- Export/Import ganzer Sessions
- gemeinsames Arbeiten mehrerer Nutzer an derselben Session
- serverseitige Zusammenfassungen und Auto-Titel nach längeren Verläufen
