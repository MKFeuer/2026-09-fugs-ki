# UI / Thinking / Aktionen

## Thema
Wie `agentv2` die laufende Arbeit des Agents sichtbarer macht.

## Ziel
Mehr Transparenz im Chat, damit klar wird, was der Agent gerade tut, warum eine Antwort gerade entsteht und was im Hintergrund bereits passiert ist.

## Grundsatz
`agentv2` soll nicht nur fertige Antworten zeigen, sondern einen nachvollziehbaren Arbeitsprozess.

Das gilt für:
- Verbindungsstatus
- Modell-/Providerwechsel
- Thinking-Phasen
- Tool-Aufrufe
- Canvas-Aktionen
- Chatwechsel und Wiederaufnahme alter Verläufe

## Sichtbare Zustände im UI

### Verbindungszustand
- `idle`
- `connecting`
- `ready`
- `streaming`
- `error`

### Erweiterte Arbeitszustände
Zusätzlich sollen mittelfristig folgende Zustände explizit sichtbar werden:
- `thinking`
- `tool_call`
- `waiting_for_tool`
- `background_stream`
- `done`

## Ereignisse, die im Verlauf sichtbar werden sollen

### Session und Chat
- Session geladen
- neuer Chat angelegt
- Chat umgeschaltet
- alter Chat wiederhergestellt
- Chattitel automatisch gesetzt oder geändert

### Modell und Provider
- Modell ausgewählt
- Provider verbunden
- Provider nicht erreichbar
- Modell unterstützt Tools nicht oder nur eingeschränkt

### Antworterzeugung
- Assistent startet Antwort
- Token-Streaming läuft
- Antwort abgeschlossen
- Antwort abgebrochen

### Tools und Canvas
- Tool-Aufruf gestartet
- Tool wartet auf Ergebnis
- Tool erfolgreich beendet
- Tool fehlgeschlagen
- Canvas aktualisiert
- Karte, Diagramm oder Notiz abgelegt

## Wo diese Informationen erscheinen sollen

### Statusleiste / Header
Für den aktuellen Moment:
- Verbindungsstatus
- aktives Modell
- aktiver Provider

### Chatverlauf
Für den inhaltlichen Ablauf:
- Nutzer- und Assistentennachrichten
- ein turn-gebundener Aktionsblock direkt oberhalb der zugehörigen Assistant-Nachricht
- keine lose globale Eventliste als Primärdarstellung im Chat

### Aktivitätenbereich rechts
Für übergreifende Transparenz:
- Tool-Läufe
- Canvas-Ereignisse
- Chatwechsel
- Wiederaufnahme alter Chats

## Primäre Chat-Regel
Die eigentliche Prozesssicht im Chat wird nicht mehr als freie Folge einzelner Activity-Einträge modelliert.

Stattdessen gilt:
- Aktionen gehören zu einem Assistant-Turn
- sie erscheinen oberhalb der finalen Antwort
- sie bleiben zunächst offen
- sie klappen mit der nächsten Nutzer-Nachricht automatisch zusammen
- sie können später wieder aufgeklappt werden

Die genaue Ablaufplanung liegt in `docs/chat-turns-actions/`.

## Wichtige Regel für Historie
Alles, was für das Verständnis einer später wieder geöffneten Lage relevant ist, darf nicht nur ephemer im Stream auftauchen.

Deshalb sollen später persistiert werden:
- Aktivitäten
- Tool-Runs
- Canvas-Aktionen
- Fehlerzustände

Nur reine Token-Deltas müssen nicht einzeln gespeichert werden.

## Wichtige Regel für alte Chats
Beim Umschalten auf einen alten Chat muss sichtbar bleiben:
- mit welchem Modell der Chat geführt wurde
- ob Tools eingesetzt wurden
- welche Canvas-Artefakte entstanden sind
- ob es Fehler oder Abbrüche gab

Sonst ist der Chat zwar lesbar, aber nicht wirklich nachvollziehbar.
