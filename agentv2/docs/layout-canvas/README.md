# Layout / Canvas

## Thema
Grundaufbau der Arbeitsfläche in `agentv2`.

## Wunsch
- Links ein Chatfenster
- Rechts ein Canvas-Bereich
- Der Canvas soll verschiedene Inhalte anzeigen können
- Mögliche Inhalte: Bilder, Diagramme, Lagepläne und Planungen
- Inhalte werden vom Agenten per Function Calling abgelegt

## Ziel
Ein schneller Überblick über die Lageplanung, bei dem der Chat die Interaktion steuert und der Canvas die wichtigen visuellen Artefakte zeigt.

## Kartenregel
Die Karte ist keine doppelte oder lose zusammengesteckte Darstellung:
- ein Layer für die Basis
- ein Layer für Overlay-Objekte
- ein gemeinsamer Projektion- und View-State
- Layer müssen ein- und ausblendbar sein
- Punkte, Routen und Flächen werden immer aus derselben Projektion berechnet
