# Chat / Turns / Aktionsanzeige

## Ziel
Der Chat in `agentv2` soll den Arbeitsprozess des Agents sichtbar machen, ohne den Verlauf zu überladen.

Entscheidend ist dabei:
- kurze Hinweise, was der Agent gerade gemacht hat
- diese Hinweise direkt beim zugehörigen Assistant-Turn
- sichtbar während der laufenden Bearbeitung
- nach Abschluss nicht dauerhaft groß im Verlauf stehen
- bei der nächsten Nachricht automatisch einklappen
- bei Bedarf jederzeit wieder ausklappbar

## Problem im aktuellen Stand

Die aktuell gezeigten Aktivitätseinträge stehen als lose Eventliste im Chat und wirken nicht sauber an die eigentliche Antwort gebunden.

Dadurch entstehen mehrere Probleme:
- unklare Zuordnung: Welche Aktion gehört zu welcher Antwort?
- schlechte Hierarchie: Aktionen und eigentliche Antwort konkurrieren visuell
- schlechte Historie: alte Aktionen liegen lose im Verlauf herum
- zu wenig Ruhe: auch erledigte Schritte bleiben zu präsent

## Verbindliche Produktentscheidung

Die Aktionsanzeige wird nicht als freie Eventliste im Chat geführt, sondern als Teil eines Assistant-Turns.

Das bedeutet:
- Jeder Assistant-Turn kann genau einen zugehörigen Aktionsblock haben.
- Dieser Aktionsblock steht direkt oberhalb der abschließenden Assistant-Nachricht.
- Der Aktionsblock ist während der laufenden Antwort standardmäßig geöffnet.
- Sobald die nächste Nutzer-Nachricht im selben Chat entsteht, klappt der vorherige Aktionsblock automatisch zusammen.
- Zusammengeklappte Aktionsblöcke bleiben vorhanden und sind wieder ausklappbar.

## Grundmodell: Turn statt lose Nachrichten

## Zielstruktur
Der Chat soll konzeptionell nicht nur aus einer flachen Nachrichtenliste bestehen, sondern aus Turns.

Ein Turn besteht aus:
- einer Nutzer-Nachricht
- optional einem Agent-Arbeitsprozess
- einer Assistant-Antwort
- optional einem Aktionsblock

## Warum das wichtig ist
Nur mit einem Turn-Modell lässt sich zuverlässig ausdrücken:
- welche Aktionen zu welcher Antwort gehören
- wann eine Aktionsanzeige offen oder geschlossen sein soll
- wie Historie und Wiederaufklappen funktionieren

## Turn-Struktur

### Nutzer-Turn
- startet mit einer Nutzer-Nachricht
- öffnet einen neuen Arbeitskontext für den Agenten

### Assistant-Turn
Zum selben Turn gehören:
- Streaming-Status
- Thinking-/Tool-/Canvas-Schritte
- finale Assistant-Nachricht
- kompakte Zusammenfassung der ausgeführten Schritte

## Verbindliche Platzierung im Chat

### Position
Der Aktionsblock steht direkt oberhalb der finalen Assistant-Nachricht desselben Turns.

Die Reihenfolge innerhalb des Turns ist:
1. Nutzer-Nachricht
2. laufender oder abgeschlossener Aktionsblock des Agents
3. finale Assistant-Nachricht

### Nicht erlaubt
- Aktionen als lose Liste ganz unten im Chat
- Aktionen getrennt von der Antwort im rechten Canvas-Bereich als Primärdarstellung
- Aktionen zwischen völlig fremden Nachrichten

## Visuelles Modell des Aktionsblocks

## Form
Der Aktionsblock ist keine normale Chat-Bubble.

Er ist eine kompakte Prozesskarte mit:
- kleinem Statuskopf
- kurzen Einträgen in zeitlicher Reihenfolge
- knapper Summenzeile im zusammengeklappten Zustand

## Inhalt
Jeder Eintrag soll sehr kurz und sachlich sein.

Empfohlen:
- Verb + Objekt
- maximal eine kurze Ergänzung
- keine langen Sätze

Beispiele:
- `Hydranten gesucht`
- `2 Hydranten priorisiert`
- `Wasserquelle geprüft`
- `Pendelroute berechnet`
- `Karte auf Canvas abgelegt`

## Nicht erwünscht
- lange Fließtexte
- komplette Tool-Outputs
- technische JSON- oder Debug-Ausgaben
- Wiederholung der finalen Antwort im Aktionsblock

## Zustände des Aktionsblocks

Der Aktionsblock kennt vier relevante UI-Zustände:

### 1. `live-expanded`
Verwendung:
- während der Agent arbeitet
- während Tool-Aufrufe oder Thinking-Schritte eingehen
- während die Antwort noch nicht final abgeschlossen ist

Eigenschaften:
- sichtbar
- geöffnet
- neue Schritte erscheinen live
- klar als laufender Prozess markiert

### 2. `settled-expanded`
Verwendung:
- direkt nach Abschluss der Assistant-Antwort
- solange noch keine neue Nutzer-Nachricht im selben Chat gesendet wurde

Eigenschaften:
- sichtbar
- geöffnet
- wirkt nicht mehr "live", sondern abgeschlossen
- steht direkt über der finalen Assistant-Nachricht

### 3. `settled-collapsed`
Verwendung:
- sobald die nächste Nutzer-Nachricht im selben Chat entsteht
- ebenfalls Standardzustand für ältere historische Turns

Eigenschaften:
- nur kompakte Kopfzeile sichtbar
- einzelne Schritte verborgen
- per Klick wieder ausklappbar

### 4. `settled-expanded-manual`
Verwendung:
- wenn der Nutzer einen alten, bereits eingeklappten Block manuell wieder öffnet

Eigenschaften:
- Schritte wieder sichtbar
- Zustand nur lokal im UI
- keine serverseitige Persistenz des Expand/Collapse-UI-Zustands nötig

## Exaktes Verhalten im Zeitablauf

## Während der Bearbeitung
Sobald der Agent anfängt zu arbeiten:
- der neue Assistant-Turn erscheint
- oberhalb der zukünftigen Antwort erscheint sofort ein leerer oder erster Aktionsblock
- der Block ist geöffnet
- neue Aktionszeilen werden live angefügt

## Während des Streamings
Wenn bereits Text gestreamt wird:
- der Aktionsblock bleibt oberhalb der Antwort sichtbar
- die Antwort wächst darunter
- der Block scrollt nicht ständig separat, sondern gehört visuell zur Antwort

## Direkt nach Abschluss
Wenn die Antwort abgeschlossen ist:
- der Aktionsblock bleibt zunächst geöffnet
- die Nutzerin oder der Nutzer kann noch direkt sehen, was gemacht wurde
- der Turn gilt als abgeschlossen, aber noch nicht archiviert

## Bei der nächsten Nutzer-Nachricht
Sobald im selben Chat die nächste Nutzer-Nachricht gesendet wird:
- der vorherige Aktionsblock klappt automatisch ein
- die alte Antwort bleibt voll sichtbar
- nur die kurze Zusammenfassungszeile bleibt oberhalb der alten Assistant-Nachricht stehen

Wichtig:
- Er verschwindet nicht vollständig.
- Er wird nur komprimiert.
- Dadurch bleibt die Nachvollziehbarkeit erhalten, ohne den Verlauf zu überladen.

## Verhalten bei Chat-Wechsel und Reload

### Aktiver Live-Chat
Im aktuell offenen Live-Chat darf nur der neueste, noch frische Turn automatisch geöffnet sein.

### Alte Turns
Ältere Turns sind standardmäßig eingeklappt.

### Reload oder Wiederöffnung eines alten Chats
Nach Reload oder späterem Wiederöffnen eines Chats gilt:
- abgeschlossene alte Turns starten eingeklappt
- ein noch laufender Turn oder der frisch letzte Turn kann offen dargestellt werden, wenn er noch aktiv ist

## Zusammengeklappter Zustand

## Ziel
Der eingeklappte Zustand soll nicht wie ein Fehler oder verschwundener Inhalt wirken.

Er soll klar signalisieren:
- hier gab es Agent-Aktivität
- Details sind vorhanden
- Details können wieder eingeblendet werden

## Sichtbarer Inhalt im Collapse-Zustand
Empfohlen:
- kleines Icon
- kurze Zusammenfassung
- Anzahl der Schritte
- optional Anzahl Tools / Canvas-Aktionen
- Chevron zum Ausklappen

Beispiel:
- `4 Schritte · 1 Tool · 1 Canvas-Aktion`
- `Hydranten geprüft · Karte erstellt · Details anzeigen`

## Regel für den Text
Die Collapse-Zeile darf nicht zu breit und nicht zu technisch werden.

Sie soll idealerweise:
- in eine Zeile passen
- maximal 60 bis 90 Zeichen tragen
- eher Überblick als Detail liefern

## Inhaltliche Gruppierung der Aktionszeilen

Nicht jede interne Mikroaktion soll sichtbar werden.

Der sichtbare Aktionsblock zeigt nur die menschlich relevanten Schritte.

## Sichtbar machen
- Thinking begonnen
- Lage analysiert
- Tool gestartet
- Tool erfolgreich
- Tool fehlgeschlagen
- Canvas aktualisiert
- Datenquelle geprüft
- Karten- oder Diagramm-Artefakt erzeugt

## Nicht sichtbar machen
- einzelne Token-Deltas
- irrelevante Zwischenschritte ohne Nutzwert
- redundante Statuswechsel ohne Aussagegewinn
- reine Low-Level-Debug-Informationen

## Empfohlene Maximalmenge
Ein Turn sollte in der offenen Ansicht idealerweise nicht mehr als ungefähr 3 bis 7 sichtbare Aktionszeilen haben.

Wenn intern mehr passiert, muss server- oder clientseitig verdichtet werden.

## Datenmodell

## Ziel
Die Aktionsanzeige darf nicht bloß aus freien Textstrings bestehen.

Sie braucht eine klare Struktur.

## Empfohlene Typen

### `ChatTurn`
- `id`
- `chatId`
- `userMessageId`
- `assistantMessageId`
- `status`
- `startedAt`
- `completedAt`
- `actionSummary`
- `actionItems`

### `TurnActionItem`
- `id`
- `turnId`
- `kind`
- `label`
- `detail`
- `tone`
- `createdAt`

### `TurnActionSummary`
- `stepCount`
- `toolCount`
- `canvasCount`
- `errorCount`
- `headline`

## Verbindliche Bindung
Alle Action-Items müssen einem konkreten `turnId` zugeordnet sein.

Nicht zulässig ist:
- nur an `chatId` hängen
- lose globale Activity-Ereignisse ohne Turn-Bezug

## Persistenz

## Was dauerhaft gespeichert werden soll
- `ChatTurn`
- `TurnActionItem`
- `TurnActionSummary`
- finale Assistant-Nachricht

## Was nicht persistiert werden muss
- ob ein Block im UI gerade aufgeklappt ist
- Scrollposition
- kurzfristige Animationen

## Warum
Der Inhalt des Blocks ist fachlich relevant.
Der Expand/Collapse-Zustand ist nur momentane Benutzerinteraktion.

## Server-Event-Modell

Die bisherige grobe Eventform sollte für dieses Verhalten verfeinert werden.

## Empfohlene Events
- `turn_started`
- `turn_action_added`
- `assistant_start`
- `assistant_delta`
- `assistant_done`
- `turn_completed`
- `turn_failed`

## Wichtige Regel
`turn_action_added` muss immer `turnId` und `assistantMessageId` oder eine gleichwertige Zuordnung tragen.

Nur so kann die UI die Anzeige exakt oberhalb der richtigen Antwort platzieren.

## Frontend-Verhalten

## Lokaler UI-Zustand
Das Frontend braucht zusätzlich pro Chat:
- `expandedTurnIds`
- `latestActiveTurnId`

## Regeln
- laufender Turn: immer expanded
- frisch abgeschlossener letzter Turn: expanded
- sobald neue Nutzer-Nachricht entsteht: alter Turn auto-collapse
- ältere historische Turns: collapsed
- manuell aufgeklappte Turns bleiben offen, bis der Nutzer sie wieder schließt oder der Chat neu geladen wird

## Scroll-Verhalten

### Beim laufenden Turn
- neue Action-Zeilen sollen im sichtbaren Verlauf bleiben
- die finale Antwort darunter soll ebenfalls sauber nachwachsen

### Beim Auto-Collapse
- das Einklappen darf nicht zu einem harten Scrollsprung führen
- die Höhe soll weich reduziert werden
- die Assistant-Nachricht darunter muss an derselben Stelle nachvollziehbar bleiben

## Rechte Seite / Canvas-Aktivitäten

Die rechte Seite kann weiterhin übergreifende Aktivitäten zeigen, aber nicht als primärer Ort für die Prozessdarstellung eines Antwort-Turns.

Deshalb gilt:
- per-Turn Aktionsschritte gehören primär in den Chat
- rechte Activity-Flächen zeigen nur ergänzende oder artefaktorientierte Informationen
- dieselbe Aktion soll nicht gleichzeitig doppelt dominant im Chat und rechts erscheinen

## Komponentenempfehlung

Für die UI-Struktur wird später empfohlen:
- `ChatTurnGroup.vue`
- `TurnActionBlock.vue`
- `TurnActionRow.vue`
- `TurnActionSummaryBar.vue`
- `AssistantMessageBubble.vue`

Dadurch bleibt klar getrennt:
- Turn-Gruppierung
- Aktionsanzeige
- eigentliche Antwort

## Mobile und enge Breiten

Auf kleinen Breiten gilt:
- eingeklappt standardmäßig bevorzugen
- offene Blöcke enger und kompakter darstellen
- keine langen Detailspalten
- maximal zweizeilige Aktionszeilen

## Accessibility

Der Collapse-Mechanismus muss:
- per Tastatur bedienbar sein
- einen klaren `aria-expanded`-Zustand haben
- einen sprechenden Button- oder Summary-Text liefern

Beispiel:
- `Aktionen zu dieser Antwort anzeigen`
- `Aktionen zu dieser Antwort verbergen`

## Nichtziel
- ausführliche technische Trace-Ansicht im normalen Chat
- permanente Vollanzeige aller alten Prozessschritte
- voneinander losgelöste Eventlisten ohne Antwortbezug
