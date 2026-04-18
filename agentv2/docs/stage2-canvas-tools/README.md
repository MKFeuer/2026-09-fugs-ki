# Stage 2 – Canvas Tools

## Ziel
Das LLM soll eigene Canvas-Aktionen ausführen können, damit Diagramme, Charts, Lagepläne, Bilder und Notizen im rechten Bereich abgelegt werden.

## Status
`done` als Basisfunktion, `partial` im Ausbauniveau.

## Enthalten
- `canvas_create_diagram` für einfache Diagramme und Strukturkarten
- `canvas_create_chart` für Balken-, Linien-, Flächen- und XY-Darstellungen
- `canvas_add_image` für vorhandene Bilder oder Bildplatzhalter
- `canvas_create_map` für Lagepläne mit Zentrum, Layern, Legende und Routen
- `canvas_add_note` für kurze Anmerkungen
- `canvas_clear` zum Zurücksetzen des Canvas
- Live-Events im UI, damit Canvas-Aktionen direkt sichtbar werden

## Im Code heute sichtbar umgesetzt
- Tooldefinitionen im Backend
- Toolausführung im Backend
- Canvas-Events im WebSocket
- Darstellung von Diagramm, Chart, Bild, Karte und Notiz im UI
- Canvas-Historie im rechten Bereich

## Noch nicht auf Zielniveau
- sauberer Refactor von Tooldefinition und Toolausführung
- turn-gebundene Aktionsdarstellung im Chat statt loser Activity-Liste
- ausgereiftere Karteninteraktionen
- persistente Speicherung der Artefakte

## Wichtig
- Keine Bildgenerierung
- Testbare Platzhalter sind erlaubt
- Der Agent soll die Tools aktiv nutzen, wenn ein visueller Artefakt-Typ benötigt wird

## Zweck
Die Lageplanung wird damit vom reinen Chat zu einem interaktiven Arbeitsbereich mit strukturierter visueller Ablage.
