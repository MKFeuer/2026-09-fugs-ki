# Map Rendering / Interactions

## Thema
Wie Lagekarten in `agentv2` korrekt, ruhig und präsentationsartig gerendert werden.

## Aktuelle Probleme
- Karten-Elemente sind noch nicht ausblendbar.
- Punkte, Marker und Bereiche landen teilweise am falschen Ort.
- Auf der Karte erscheint teils doppelte Darstellung.
- Die Karte wirkt noch wie ein Widget, nicht wie eine Slide.

## Ziel
Eine Karte soll sich wie eine Einsatztfolie verhalten:
- klare Hauptansicht
- saubere Koordinatenprojektion
- Layer ein- und ausblendbar
- Zoom und Pan
- optional Vollansicht mit allen relevanten Elementen
- keine doppelte Darstellung von Basis- und Overlay-Inhalten

## Verbindliche Regeln
### 1. Ein Kartenmodell pro Slide
Eine Map-Slide hat genau einen View-State:
- `center`
- `zoom`
- `visibleLayers`
- `selection`
- `mode` (`thumb`, `focus`, `fullscreen`)

Die Thumbnail-Historie nutzt denselben Datenstand, aber einen eigenen Rendering-Pfad.

### 2. Basiskarte und Overlay müssen getrennt bleiben
- Basiskarte: Tiles / Hintergrund
- Overlay: Marker, Bereiche, Routen, Labels

Nichts davon darf zweimal gezeichnet werden.

### 3. Koordinaten müssen aus derselben Projektion kommen
Marker, Linien und Flächen müssen immer aus:
- derselben Center-Koordinate
- demselben Zoom
- derselben Viewport-Größe
berechnet werden.

Wenn ein Element im Fokus-Modus und in der Thumb-Ansicht anders aussieht, darf nur die Darstellung kleiner oder größer werden — nicht die Geometrie selbst.

## Sichtbare Layer
Folgende Layer sollen einzeln schaltbar sein:
- Feuer / Einsatzpunkt
- Hydranten
- Wasserquellen
- Gefahrenbereich
- Pendelrouten
- Beschriftungen
- optionale Hilfslinien / Legende

## Interaktionen
- Zoom per Buttons und Mausrad
- Pan per Drag
- Fit-to-content
- Expand / Fullscreen
- Layer-Toggles
- Fokus auf einen Marker oder einen Bereich

## Präsentationslogik
Die Karte soll wie eine PowerPoint-Folie wirken:
- im normalen Canvas groß und ruhig
- in der Historie nur als kleine Vorschau
- im Vollmodus mit denselben Elementen, aber mehr Detail

Wichtig:
- keine doppelte Marker-/Label-Ausgabe
- keine zusätzliche Textliste, wenn die Karte selbst die Information trägt
- die View darf reduzieren, aber nicht die Lage verfälschen

## Umsetzungsreihenfolge
1. Karten-ViewModel definieren
2. Projektion und Bounding-Box korrigieren
3. Layer-Toggles einbauen
4. Doppelte Rendering-Pfade entfernen
5. Zoom/Pan/Fullscreen ergänzen
6. Fit-to-content für alle relevanten Kartenobjekte

