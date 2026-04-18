# Einsatzplanung / Wasserversorgung

## Thema
Ein neuer Chat wird für eine Brandlage eröffnet und unterstützt die Wasser- und Kräfteplanung.

## Szenario
- Beispiel: Brand im Perlacher Forst
- Einsatzleiter schildert Lage und Position knapp im Chat
- Die KI nutzt MCP-Tools, interne Live-Daten und `commandx`
- Zusätzliche Karten-/Maps-Daten liefern Hydranten und Wasserquellen
- Wenn nicht genug Wasser verfügbar ist, wird ein Pendelplan mit Routen geplant

## Canvas-Inhalte
- Feuer im Zentrum
- Gefahrenbereich
- Hydranten
- Wasserquellen
- Pendelplan mit eingezeichneten Routen

## Ziel
Die Lage soll in einer interaktiven Karte schnell erfassbar werden, damit Planung und Nachvollziehbarkeit im Einsatz direkt sichtbar sind.

## Karten-UX
- Hydranten, Wasserquellen, Gefahrenbereiche und Routen müssen einzeln ausblendbar sein.
- Punkte dürfen nur einmal erscheinen und müssen auf der Karte exakt an der berechneten Position liegen.
- Die Karte soll im Fokus-Modus und im Vollmodus dieselbe Geometrie verwenden.
- Der Vollmodus soll Zoom, Pan und Fit-to-content erlauben, damit alle relevanten Elemente sichtbar werden.
