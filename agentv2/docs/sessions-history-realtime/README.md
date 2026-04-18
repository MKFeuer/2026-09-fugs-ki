# Sessions / Historie / Realtime

## Ziel
Der Zustand von `agentv2` soll nachvollziehbar, wiederherstellbar und in Echtzeit sichtbar bleiben, ohne dass dafür Nutzerkonten nötig sind.

## Grundmodell

### Session
Eine Session ist die anonyme Arbeitsumgebung eines Browsers.

Sie enthält:
- Metadaten zur Sitzung
- die Liste aller Chats dieser Sitzung
- den aktuell aktiven Chat
- keine Benutzeridentität im klassischen Sinne

### Chat
Ein Chat ist die eigentliche fachliche Unterhaltung.

Ein Chat enthält:
- Nachrichten
- Aktivitäten und Thinking-/Tool-Events
- Canvas-Inhalte
- das gewählte Modell
- Titel, Zeitstempel und Status

Wichtig:
- Der Nutzer navigiert primär über Chats.
- Sessions sind eher technischer Container und Wiederherstellungsgrenze.

## Session-Lifecycle

### Erster Besuch
1. Browser öffnet `agentv2`.
2. Backend erstellt `session_id` und `session_secret`.
3. `session_secret` wird als HttpOnly-Cookie gesetzt.
4. `session_id` wird im Frontend gespeichert.
5. Backend legt direkt einen ersten leeren Chat an.

### Wiederkehrender Besuch
1. Frontend sendet vorhandene `session_id`.
2. Browser liefert automatisch das Cookie mit `session_secret`.
3. Backend prüft die Kombination.
4. Bei Erfolg wird ein Session-Snapshot zurückgegeben.
5. Bei Fehlschlag wird eine neue Session erzeugt.

### Neuer Chat
- `Neuer Chat` erstellt einen weiteren Chat innerhalb derselben Session.
- Der neue Chat wird sofort aktiv.
- Die Chatliste wird nach `updated_at DESC` neu sortiert.

### Neue Session
- Eine neue Session ist ein seltener Spezialfall.
- Sie ist sinnvoll für einen komplett neuen Arbeitskontext oder zum bewussten Trennen von Lagen.
- Im UI sollte sie später als sekundäre Aktion verfügbar sein, aber nicht die Hauptnavigation dominieren.

## Primäre Navigation: alte Chats statt alte Sessions

Die wichtigste Wiederaufnahme im UI ist nicht der Wechsel zwischen Sessions, sondern der Wechsel zwischen alten Chats derselben Session.

Deshalb gilt:
- Links wird eine Chatliste angezeigt.
- Der aktive Chat ist deutlich markiert.
- Alte Chats bleiben schnell umschaltbar.
- Sessions selbst bleiben zunächst im Hintergrund.

## Darstellung alter Chatverläufe

### Chatliste links
Jeder Eintrag in der Chatliste sollte mindestens zeigen:
- Titel
- kurze Vorschau der letzten Nachricht oder letzten Aktivität
- Zeitstempel der letzten Änderung
- Badge für Provider/Modell
- optional Status-Badge wie `streaming`, `error` oder `tools active`

### Sortierung
- Standard: `updated_at DESC`
- Neueste oder gerade aktive Chats erscheinen oben
- Chats mit laufendem Stream bleiben ebenfalls weit oben sichtbar

### Gruppierung
Empfohlen:
- Heute
- Diese Woche
- Älter

Das verbessert die Orientierung bei vielen Lagen deutlich.

### Umfang der Liste
- Anfangs reichen die letzten 20 bis 50 Chats der Session.
- Ältere Chats werden paginiert oder per "mehr laden" nachgeladen.
- Das Frontend soll nicht beim Start jede Nachricht jedes Chats laden.

## Umschalten zwischen alten Chats

### Empfohlener Ablauf
1. Nutzer klickt auf einen Chat in der Liste.
2. Frontend setzt den Chat sofort visuell aktiv.
3. Falls Nachrichten und Canvas noch nicht lokal geladen sind, lädt das Frontend sie nach.
4. Backend liefert Nachrichten, Aktivitäten und Canvas für genau diesen Chat.
5. UI stellt Chat und Canvas gemeinsam um.

### Während ein anderer Chat noch streamt
Empfohlene Strategie:
- Ein laufender Stream darf im Hintergrund fertiglaufen.
- Der Nutzer darf trotzdem zu einem anderen Chat wechseln.
- Die Chatliste zeigt dafür einen sichtbaren `live`- oder `streaming`-Status.

Das ist praktischer als ein harter Wechsel-Blocker und passt besser zu einer Leitstellen- oder Stabsoberfläche.

## Realtime-Modell

### HTTP ist zuständig für
- Session-Snapshot beim Start
- Chatliste
- paginierte Nachrichtenhistorie
- einzelne Canvas-Snapshots
- Health- und Modelllisten

### WebSocket ist zuständig für
- Live-Deltas der Assistentenantwort
- Tool-Start und Tool-Ende
- Thinking-/Status-Ereignisse
- neue Aktivitäten
- Canvas-Änderungen
- Stream-Ende und Fehlerstatus

### Warum hybrid statt nur WebSocket
- Listen und Historie lassen sich über HTTP einfacher paginieren und debuggen.
- Reconnect ist robuster.
- Alte Chats können gezielt geladen werden, ohne dass ein permanenter Eventkanal alle Daten nachliefern muss.

## Persistenzmodell in PostgreSQL

## Tabellen

### `sessions`
- `id`
- `secret_hash`
- `created_at`
- `updated_at`
- `last_seen_at`

### `chats`
- `id`
- `session_id`
- `title`
- `model_id`
- `status`
- `last_message_preview`
- `created_at`
- `updated_at`
- `archived_at`

### `messages`
- `id`
- `chat_id`
- `role`
- `content`
- `state`
- `provider_message_id`
- `created_at`

### `activities`
- `id`
- `chat_id`
- `kind`
- `label`
- `detail`
- `tone`
- `payload_json`
- `created_at`

### `canvas_items`
- `id`
- `chat_id`
- `kind`
- `title`
- `payload_json`
- `created_at`
- `updated_at`

### `tool_runs`
- `id`
- `chat_id`
- `tool_name`
- `status`
- `arguments_json`
- `result_json`
- `started_at`
- `finished_at`

## Cache- und Redis-Entscheidung

### Zunächst ohne Redis
- Eine einzelne Bun-Instanz kann aktive WebSocket-Verbindungen im Speicher halten.
- PostgreSQL reicht als dauerhafte Quelle aus.
- Das System bleibt einfacher zu verstehen und zu debuggen.

### Redis wird erst sinnvoll bei
- mehreren Backend-Instanzen
- getrennten Worker-Prozessen für Tool-Läufe
- Pub/Sub für Live-Events über mehrere Prozesse hinweg
- verteilter Sperrlogik für laufende Streams

## Wiederherstellung nach Reload oder Verbindungsabbruch

Beim Reload gilt:
1. Frontend lädt `session_id` lokal.
2. Backend liefert Snapshot der Session.
3. Aktiver Chat wird wiederhergestellt.
4. Falls ein Stream vorher lief, zeigt das Backend den finalen Zustand oder einen abgebrochenen Status.

Wichtig:
- Das UI darf sich nicht auf lokalen Speicher als Wahrheit verlassen.
- Der Server-Snapshot ist autoritativ.

## Sicherheits- und Robustheitsregeln
- Keine Session-Wiederaufnahme nur über frei erratbare IDs.
- Keine API-Keys im Frontend.
- Jeder Chatwechsel muss sowohl Chat als auch Canvas konsistent umstellen.
- Große alte Verläufe nur stückweise laden.
- Aktivitäten und Tool-Läufe müssen später auch historisch sichtbar bleiben.

## Nichtziel für die erste Ausbaustufe
- Mehrbenutzer-Kollaboration in derselben Session
- globale Inbox über mehrere Sessions
- komplexe Rechte- oder Rollenmodelle
