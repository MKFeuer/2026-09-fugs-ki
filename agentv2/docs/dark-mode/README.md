# Darkmode / Theme Toggle / Firefox

## Ziel
`agentv2` soll einen umschaltbaren Darkmode bekommen, der drei Anforderungen gleichzeitig erfüllt:

- Nutzer können das Theme bewusst umstellen.
- Die Entscheidung bleibt lokal gespeichert und muss nicht jedes Mal neu gesetzt werden.
- Im automatischen Modus folgt die Oberfläche dem von Firefox gemeldeten Hell-/Dunkelmodus.

## Verbindliche Produktentscheidung

### Theme ist eine UI-Präferenz, kein Session-Inhalt
Das Theme gehört nicht zur Einsatzlage, nicht zum Chat und nicht zur Session-Persistenz in PostgreSQL.

Es ist eine lokale Geräte- und Browser-Präferenz.

Deshalb gilt:
- Speicherung lokal im Browser
- keine Speicherung im Backend
- keine Kopplung an Chats oder Sessions

## Empfohlenes Zustandsmodell

Es reicht nicht, nur `light` und `dark` zu unterscheiden.

Sinnvoll ist ein Drei-Zustands-Modell:
- `system`
- `light`
- `dark`

### Bedeutung
- `system`
  `agentv2` folgt dem von Firefox oder dem Betriebssystem gemeldeten Farbschema.
- `light`
  `agentv2` bleibt hell, unabhängig von Firefox.
- `dark`
  `agentv2` bleibt dunkel, unabhängig von Firefox.

### Warum kein reiner Binär-Toggle
Ein rein binärer Toggle kann entweder manuell umschalten oder automatisch folgen, aber nicht beides sauber ausdrücken.

Wenn automatische Anpassung an Firefox gewünscht ist, braucht das System eine explizite `system`-Option.

## Empfohlene UI-Lösung

### Primäre Empfehlung
Im Header kommt ein kompaktes Theme-Control neben Modellwahl und Verbindungsstatus.

Empfohlenes Verhalten:
- Klick auf das Theme-Icon öffnet ein kleines Menü oder Popover.
- Dort gibt es drei Optionen: `Auto`, `Hell`, `Dunkel`.
- Das Icon zeigt den aktuell aufgelösten Zustand:
  - Sonne für hell
  - Mond für dunkel
  - halbautomatisches oder neutrales Icon für `Auto`

### Warum das besser ist als ein bloßer Schalter
- klar verständlich
- wenig Platzbedarf
- lässt automatische Anpassung sichtbar und bewusst auswählbar
- vermeidet versteckte Logik

### Falls zwingend ein echter Toggle gewünscht ist
Dann sollte zusätzlich ein kleiner Sekundärpfad für `Auto` existieren, zum Beispiel:
- Toggle schaltet nur `Hell` <-> `Dunkel`
- daneben oder im gleichen Menü gibt es `Auto`

Ohne diesen dritten Zustand wird die Firefox-Anpassung unklar.

## Empfohlene Persistenz

### Speicherort
Die Präferenz soll in `localStorage` liegen, zum Beispiel unter:

`agentv2.themePreference`

### Werte
- `system`
- `light`
- `dark`

### Standardwert
Der Standardwert sollte `system` sein.

Das ist am sinnvollsten, weil neue Nutzer damit sofort eine zu Firefox passende Darstellung bekommen.

## Technisches Zustandsmodell im Frontend

Empfohlen sind zwei getrennte Zustände:

### `themePreference`
Die vom Nutzer gewählte Präferenz:
- `system`
- `light`
- `dark`

### `resolvedTheme`
Das tatsächlich aktive Theme:
- `light`
- `dark`

### Beispiel
- `themePreference = system`
- Firefox meldet dunkel
- `resolvedTheme = dark`

Wenn der Nutzer später `light` wählt:
- `themePreference = light`
- `resolvedTheme = light`

## Firefox-Anpassung: was möglich ist und was nicht

## Was möglich ist
Firefox liefert dem Web über Web-Standards, ob ein helles oder dunkles Farbschema bevorzugt wird.

Die passende Schnittstelle ist:

`matchMedia("(prefers-color-scheme: dark)")`

Damit kann `agentv2`:
- initial hell oder dunkel starten
- auf Themewechsel reagieren, solange `themePreference = system`
- die Oberfläche live umstellen, wenn der Firefox-Modus sich ändert

## Was nicht möglich ist
Eine Webseite kann nicht zuverlässig das exakte Firefox-Theme oder die genauen Farbwerte einer Firefox-Theme-Erweiterung auslesen.

Das bedeutet:
- kein direktes Auslesen der Browser-Chrome-Farben
- kein echtes 1:1-Sync mit beliebigen Firefox-Accent-Farben
- automatische Anpassung nur auf Ebene `hell` oder `dunkel`

Wichtig:
`agentv2` kann sich also an das Firefox-Theme annähern, aber nicht das komplette Browser-Design spiegeln.

## Technischer Ablauf beim Start

Um Flackern zwischen hell und dunkel beim Laden zu vermeiden, sollte die Theme-Entscheidung vor dem Vue-Mount getroffen werden.

### Empfohlener Ablauf
1. Früh in `index.html` ein kleines Inline-Skript ausführen.
2. `localStorage` lesen.
3. Falls kein Wert existiert: `system` annehmen.
4. Bei `system` `prefers-color-scheme` auswerten.
5. `data-theme` am `document.documentElement` setzen.
6. `color-scheme` passend setzen.
7. Erst danach die App rendern.

## Empfohlene DOM-Attribute

### Auf `html`
- `data-theme="light"` oder `data-theme="dark"`
- optional `data-theme-preference="system|light|dark"`

### Warum das sinnvoll ist
- CSS bleibt einfach
- Vue-State und DOM-Zustand bleiben trennbar
- Debugging im Browser wird leichter

## CSS-Strategie

## Bestehende Grundlage in `agentv2`
`src/styles.css` nutzt bereits Farbvariablen auf `:root`.

Das ist eine gute Basis, sollte aber in eine klarere Token-Struktur überführt werden:
- semantische Oberflächentokens
- Texttokens
- Status- und Aktionsfarben
- Schatten und Overlays
- Canvas-spezifische Farben

## Empfohlene Struktur

### 1. Semantische Tokens statt Mischlogik pro Komponente
Beispiele:
- `--surface-app`
- `--surface-panel`
- `--surface-elevated`
- `--border-default`
- `--text-primary`
- `--text-secondary`
- `--accent-primary`
- `--accent-soft`
- `--status-live`
- `--status-error`

### 2. Theme-Spezifische Werte getrennt definieren
- `:root` für Defaults
- `html[data-theme="light"]` für helle Werte
- `html[data-theme="dark"]` für dunkle Werte

### 3. Native Controls integrieren
Zusätzlich sollte gesetzt werden:
- `color-scheme: light`
- `color-scheme: dark`

Dadurch passen sich native Inputs, Scrollbars und Formelemente besser an.

## Visuelle Leitlinien für den Darkmode

Der Darkmode soll nicht aussehen wie eine generische schwarze Entwickleroberfläche.

Er soll:
- ruhig bleiben
- warm bleiben
- den Charakter von `agent` behalten
- in Einsatzlagen nicht aggressiv blenden

### Deshalb empfohlen
- keine reinen Schwarzflächen
- dunkle, leicht warme Flächen in OKLCH
- weiter klar lesbare Karten und Canvas-Ränder
- Akzentfarbe nicht neonhaft aufblasen
- Fehlermeldungen und Live-Status weiter deutlich, aber nicht grell

## Verhalten bei Firefox-Themewechsel im laufenden Betrieb

Wenn `themePreference = system`, dann gilt:
- auf `matchMedia(...).addEventListener("change", ...)` hören
- `resolvedTheme` live neu berechnen
- DOM und `color-scheme` sofort aktualisieren

Wenn `themePreference = light` oder `dark`, dann gilt:
- Firefox-Wechsel ignorieren
- die manuelle Nutzerentscheidung bleibt maßgeblich

## Verhalten bei fehlendem Storage oder Sonderfällen

### Wenn `localStorage` nicht verfügbar ist
Fallback:
- `system`

### Private Browsing
Wenn Firefox `localStorage` nur temporär hält, ist das akzeptabel.

Dann gilt:
- Theme bleibt nur für die laufende Sitzung erhalten
- nach einem neuen privaten Fenster beginnt `agentv2` wieder mit `system`

## Accessibility und Robustheit

### Kontrast
Für Text und UI-Elemente muss im hellen wie dunklen Modus ausreichender Kontrast erhalten bleiben.

Mindestens relevant:
- Primärtext
- Sekundärtext
- Chat-Pills
- Status-Chips
- Fehlermeldungen
- Kartenmarker und Canvas-Rahmen

### Zusätzliche Mediensignale
Mittelfristig sinnvoll:
- `prefers-contrast`
- `forced-colors`

Das ist nicht Teil der ersten Ausbaustufe, sollte aber bei der Token-Struktur mitgedacht werden.

## Theme und Canvas

Canvas-Artefakte gehören weiterhin zum Chat, aber das Theme nicht.

Wichtig:
- Diagramme und Karten dürfen nicht hart für hellen Hintergrund erzeugt werden.
- Canvas-Komponenten müssen Theme-Tokens nutzen.
- Leere Zustände, Notizkarten und Mini-Vorschauen müssen in beiden Modi funktionieren.

## Theme und Persistenzmodell

### Nicht in PostgreSQL speichern
Die Theme-Wahl gehört bewusst nicht in:
- `sessions`
- `chats`
- `messages`

### Warum nicht
- es ist keine fachliche Lageinformation
- es ist gerätebezogene UI-Präferenz
- serverseitige Persistenz bringt wenig Nutzen und mehr Komplexität

## Empfohlene Umsetzungsreihenfolge

### Phase 1 – Grundlagen
- `themePreference` und `resolvedTheme` definieren
- `localStorage`-Key festlegen
- frühes Bootstrapping gegen FOUC einbauen

### Phase 2 – CSS-Tokens
- vorhandene Farbvariablen in semantische Tokens überführen
- `light` und `dark` Werte getrennt definieren
- `color-scheme` korrekt setzen

### Phase 3 – UI-Control
- Theme-Button oder Popover im Header
- `Auto`, `Hell`, `Dunkel`
- aktiven Zustand sichtbar machen

### Phase 4 – Komponentenprüfung
- Chat
- Chatliste
- Status-Chips
- Aktivitätsfeed
- Canvas-Karten und Artefakte
- Fehlermeldungen und leere Zustände

### Phase 5 – Feinschliff
- `meta[name="theme-color"]` bei Themewechsel mit aktualisieren
- Firefox-Wechsel im laufenden Betrieb prüfen
- Kontrast und visuelle Balance nachziehen

## Testmatrix

Zu prüfen sind mindestens:
- Firefox mit hellem Theme, Einstellung `Auto`
- Firefox mit dunklem Theme, Einstellung `Auto`
- Wechsel Firefox hell -> dunkel bei offener Seite
- Wechsel Firefox dunkel -> hell bei offener Seite
- manuell `Hell`, danach Firefox auf dunkel
- manuell `Dunkel`, danach Firefox auf hell
- Reload nach gespeicherter Präferenz
- Erststart ohne gespeicherte Präferenz

## Nichtziel
- exakte Übernahme beliebiger Firefox-Theme-Farben
- Theme-Persistenz pro Chat
- serverseitige Theme-Synchronisierung zwischen Geräten
