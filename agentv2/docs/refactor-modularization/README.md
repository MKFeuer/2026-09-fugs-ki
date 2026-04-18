# Refactor / Modularisierung

## Ziel
`agentv2` soll so refactored werden, dass UI, Server und gemeinsame Vertragsdaten in kleine, klar abgegrenzte Module zerlegt werden.

Der Refactor soll nicht nur "schöner" wirken, sondern konkret erreichen:
- kleinere und besser lesbare Dateien
- klarere Verantwortlichkeiten
- weniger doppelte Typdefinitionen
- testbare Logik ohne Vue- oder Bun-Abhängigkeit
- leichtere Erweiterbarkeit für Theme, Sessions, Provider, Canvas und Tools

## Ausgangslage

Der aktuelle Stand ist funktional, aber die zentralen Dateien sind bereits zu groß:
- `src/App.vue` hat aktuell rund 630 Zeilen
- `server/index.ts` hat aktuell rund 777 Zeilen
- `src/styles.css` hat aktuell rund 1154 Zeilen

Das ist ein typischer Punkt, an dem weitere Features die Übersicht schnell kippen lassen.

## Verbindliche Refactor-Prinzipien

### 1. Eine Datei soll nur eine Hauptverantwortung haben
Beispiele:
- keine UI-Komponente mit kompletter WebSocket-Orchestrierung
- kein Server-Entry mit Tool-Definitionen, Canvas-Factories, Sessionhandling und Chat-Loop zugleich
- keine globale CSS-Datei für App, Chat, Canvas, Karten und Themes gleichzeitig

### 2. Verhalten vor Layout
Logik wird zuerst aus großen Dateien in plain TypeScript ausgelagert.

Komponenten und Entry-Dateien sollen dann vor allem:
- zusammensetzen
- initialisieren
- rendern

Nicht aber die gesamte Fachlogik enthalten.

### 3. Gemeinsame Verträge gehören in `shared`
Typen und Protokolle, die Frontend und Backend gleichzeitig benutzen, dürfen nicht doppelt gepflegt werden.

Dazu gehören später mindestens:
- Session-Snapshots
- Chat- und Activity-Typen
- WebSocket-Events
- Modell- und Provider-Infos
- Canvas-Artefakte

### 4. Keine "Mega-Utility"-Dateien
Hilfsfunktionen dürfen nicht in einer wachsenden Sammeldatei landen.

Stattdessen:
- Konvertierung getrennt
- Validierung getrennt
- Provider-Layer getrennt
- Canvas-Factories getrennt

### 5. Entry-Dateien bleiben dünn
`App.vue` und `server/index.ts` sollen primär zusammensetzen und bootstrappen.

Sie sollen nicht die eigentlichen Fachmodule sein.

## Zielgrößen für Dateien

Das sind keine harten Compiler-Regeln, aber klare Leitplanken:

### Frontend
- einfache UI-Komponenten: ideal unter 150 Zeilen
- zusammensetzende Feature-Komponenten: ideal unter 250 Zeilen
- Composables: ideal unter 200 Zeilen
- Root-Komponente `App.vue`: möglichst unter 200 Zeilen

### Backend
- `server/index.ts`: möglichst unter 150 bis 200 Zeilen
- Handler- oder Service-Dateien: ideal unter 250 Zeilen
- Provider-Adapter: ideal unter 200 Zeilen
- Definitionsdateien für Tools: möglichst klar getrennt und klein halten

### CSS
- Theme-Tokens getrennt
- Layout-Regeln getrennt
- Feature-Styling getrennt
- keine einzelne Stylesheet-Datei mit mehr als einigen hundert Zeilen als Dauerzustand

## Frontend: empfohlene Zielstruktur

## Grundsatz
Das Frontend soll nach Feature statt nach Zufall geschnitten werden.

Die aktuelle `App.vue` enthält gleichzeitig:
- Session-State
- Chat-State
- WebSocket-Verbindung
- Modellwahl
- Nachrichtenlogik
- Canvas-Auswahl
- UI-Markup

Das muss getrennt werden.

## Empfohlene Ordnerstruktur

```text
src/
  app/
    AppShell.vue
    AppProviders.ts

  features/
    connection/
      components/
        ConnectionStatusChip.vue
      composables/
        useAgentConnection.ts
      types.ts

    chat/
      components/
        ChatPanel.vue
        ChatHeader.vue
        ChatComposer.vue
        ChatList.vue
        ChatListItem.vue
        ChatTimeline.vue
        ChatTurnGroup.vue
        TurnActionBlock.vue
        TurnActionSummaryBar.vue
        ChatMessageItem.vue
      composables/
        useChatActions.ts
        useChatSelection.ts
        useTurnExpansion.ts

    canvas/
      components/
        CanvasPanel.vue
        CanvasRail.vue
        CanvasActivityFeed.vue
        CanvasArtifact.vue
      composables/
        useCanvasSelection.ts

    models/
      components/
        ModelSelector.vue
      composables/
        useModelSelection.ts

    theme/
      components/
        ThemeControl.vue
      composables/
        useTheme.ts

    session/
      composables/
        useSessionState.ts

  services/
    ws/
      agentSocketClient.ts

  shared/
    render/
      markdown.ts

  styles/
    tokens.css
    base.css
    layout.css
    chat.css
    canvas.css
    themes.css

  App.vue
  main.ts
```

## Konkrete Frontend-Schnitte

### `App.vue`
Soll nur noch:
- Shell-Struktur zusammensetzen
- Feature-Komponenten zusammenführen
- keine detailreiche Chat- oder Socket-Logik mehr enthalten

### `useAgentConnection`
Verantwortlich für:
- WebSocket öffnen und schließen
- Verbindungsstatus
- Event-Dispatch
- Reconnect- oder Auto-Connect-Verhalten

Nicht verantwortlich für:
- Chat-Rendering
- Canvas-Auswahl
- Theme

### `useSessionState`
Verantwortlich für:
- Session-Snapshot anwenden
- aktive Chats verwalten
- Chatdaten lokal aktualisieren
- Session-ID lokal halten

### `useChatActions`
Verantwortlich für:
- Nachricht senden
- Chat anlegen
- Chat wechseln
- lokale Platzhalternachrichten und Stream-Zustände

### `useTurnExpansion`
Verantwortlich für:
- welche Turn-Aktionsblöcke offen sind
- automatisches Einklappen beim nächsten Nutzer-Turn
- manuelles Wiederaufklappen alter Turns

### `useCanvasSelection`
Verantwortlich für:
- ausgewähltes Canvas-Item pro Chat
- Scroll-/Focus-Verhalten im Canvas-Rail

### `ModelSelector`
Verantwortlich für:
- Darstellung verfügbarer Modelle
- Umschalten erlaubter Modelle
- keine Kenntnis von Provider-Interna

### `MarkdownMessage.vue`
Die eigentliche Markdown-Renderlogik sollte aus der Vue-Datei in ein Utility-Modul ausgelagert werden.

Dann bleibt die Komponente ein schmaler Wrapper.

### `ChatTurnGroup.vue`
Soll später die kleinste fachliche Chat-Einheit sein:
- Nutzer-Nachricht
- turn-gebundener Aktionsblock
- Assistant-Nachricht

So wird verhindert, dass Aktionen wieder lose neben dem eigentlichen Antwortverlauf leben.

## Frontend: Was bewusst nicht sofort eingeführt werden soll

### Kein zusätzlicher State-Manager nur aus Prinzip
`agentv2` ist noch klein genug, dass Composables und plain refs ausreichen.

Pinia oder ein anderes Store-System sollte erst eingeführt werden, wenn:
- mehrere Seiten entstehen
- sehr viele unabhängige globale States parallel bestehen
- Composables unübersichtlich verschachtelt werden

## Backend: empfohlene Zielstruktur

## Grundsatz
`server/index.ts` ist aktuell zugleich:
- HTTP-Server
- WebSocket-Server
- Sessionstore
- Chat-Loop
- OpenAI-Integration
- Canvas-Tooldefinition
- Canvas-Toolausführung
- Datenkonvertierung
- Fehlerbehandlung

Das muss in klare Backend-Module getrennt werden.

## Empfohlene Ordnerstruktur

```text
server/
  index.ts

  config/
    env.ts
    models.ts

  http/
    routes/
      health.ts
      models.ts
      runtime-config.ts

  ws/
    protocol.ts
    connection.ts
    handlers/
      init.ts
      chat.ts
      new-chat.ts
      switch-chat.ts

  sessions/
    store.ts
    service.ts

  chat/
    conversation.ts
    handler.ts
    activity.ts

  providers/
    openai-compatible.ts
    registry.ts
    health.ts

  canvas/
    tools/
      definitions.ts
      executor.ts
    factories/
      diagram.ts
      image.ts
      map.ts
      note.ts

  utils/
    parsing.ts
    guards.ts
    ids.ts
```

## Konkrete Backend-Schnitte

### `server/index.ts`
Soll nur:
- Konfiguration laden
- HTTP- und WS-Router zusammenstecken
- Server starten

### `config/env.ts`
Verantwortlich für:
- `.env` lesen
- Pflichtvariablen validieren
- Fehlkonfigurationen früh abbrechen

### `config/models.ts`
Verantwortlich für:
- Provider aus `.env` in normalisierte Modellkonfiguration überführen
- `DEFAULT_MODEL_ID` und `AUTO_CONNECT_MODEL_ID` auflösen

### `providers/openai-compatible.ts`
Verantwortlich für:
- Streaming gegen OpenAI-kompatible Endpunkte
- OpenAI und Ollama über dieselbe technische Schnittstelle

### `chat/handler.ts`
Verantwortlich für:
- Gesprächsschleife
- Tool-Runden
- Zusammensetzen der finalen Antwort

Nicht verantwortlich für:
- Rohdefinitionen der Canvas-Tools
- Session-Persistenz
- HTTP-Routing

### `canvas/tools/definitions.ts`
Nur Tool-Schemata.

### `canvas/tools/executor.ts`
Nur Ausführung der Tool-Calls und Erzeugen von Canvas-Artefakten.

### `canvas/factories/*`
Je Artefakttyp eine Datei:
- Diagramm
- Bild
- Karte
- Notiz

### `sessions/store.ts`
Anfangs:
- In-Memory-Zugriff

Später:
- austauschbar gegen PostgreSQL-gestützte Services

## Shared Contracts

## Ziel
Das Frontend soll nicht eigene Versionen derselben Event- und Snapshot-Typen pflegen.

Deshalb sollte `shared/` später erweitert werden:

```text
shared/
  canvas.ts
  session.ts
  protocol.ts
  models.ts
```

### Dorthin gehören
- `ChatMessage`
- `ActivityItem`
- `SessionSnapshot`
- WebSocket `ClientEvent` und `ServerEvent`
- Modellinfos wie `ModelSummary`

Das reduziert Drift zwischen Frontend und Backend.

## CSS- und Theme-Refactor

Die Styles sind schon jetzt groß genug, um künftig ein Wartungsproblem zu werden.

## Zielstruktur
- `tokens.css`
  Semantische Farb- und Abstandsvariablen
- `themes.css`
  Light/Dark-Werte und Theme-Overrides
- `base.css`
  Resets, Typografie, Scrollbars
- `layout.css`
  Shell, Panels, Grids
- `chat.css`
  Chatliste, Nachrichten, Composer
- `canvas.css`
  Canvas-Rail, Karten, Artefakte, Activities

## Wichtige Regel
Komponentenstil darf nicht an Farbwerte gebunden sein, sondern nur an semantische Tokens.

Das ist Voraussetzung für den geplanten Darkmode.

## Empfohlene Refactor-Reihenfolge

### Phase 1 – Grenzen sichtbar machen
- große Dateien identifizieren
- Typen und Verantwortlichkeiten dokumentieren
- keine neuen Features direkt in `App.vue` oder `server/index.ts` hineinbauen

### Phase 2 – Shared Contracts extrahieren
- Session-Typen
- Protokolltypen
- Modelltypen

### Phase 3 – Frontend entkoppeln
- Socket-Logik in `useAgentConnection`
- Session-/Chatlogik in eigene Composables
- `App.vue` auf Shell-Größe zurückbauen

### Phase 4 – Backend entkoppeln
- `.env`-Config trennen
- Provider-Registry trennen
- Chat-Loop trennen
- Canvas-Definitionen und Executor trennen

### Phase 5 – CSS zerlegen
- Tokens
- Themes
- Layout
- Chat
- Canvas

### Phase 6 – Tests nachziehen
- Parser und Guards
- Canvas-Factories
- Provider-Config
- Chat-Handler mit Mocks
- Theme- und Connection-Composables

## Harte No-Gos für weitere Entwicklung
- keine neuen großen Featureblöcke direkt in `App.vue`
- keine neuen Provider-Sonderfälle direkt in `server/index.ts`
- keine duplizierten Eventtypen in Frontend und Backend
- keine `.env`-Direktzugriffe an mehreren zufälligen Stellen
- keine neue globale CSS-Sammeldatei für jedes zusätzliche UI-Feature

## Ergebnisbild

Wenn der Refactor sauber umgesetzt ist, gilt:
- Root-Dateien sind übersichtlich
- neue Features landen an klaren Stellen
- OpenAI, Ollama, Theme, Sessions und Canvas können getrennt weiterentwickelt werden
- Bugs lassen sich schneller eingrenzen
- kleine Dateien bleiben leichter reviewbar und testbar
