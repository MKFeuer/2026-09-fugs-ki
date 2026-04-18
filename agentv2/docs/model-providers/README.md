# Modellprovider / OpenAI / Ollama

## Ziel
`agentv2` soll mehrere Modellprovider parallel unterstützen, ohne dass das Frontend Provider-Logik oder Geheimnisse kennen muss.

Mindestens diese zwei Wege sollen sauber nebeneinander funktionieren:
- OpenAI
- lokales Ollama

## Leitentscheidung
Für `agentv2` wird keine Sonderlogik "nur für Ollama" gebaut.

Stattdessen wird eine generische Modellregistry eingeführt:
- der Server kennt alle verfügbaren Modelle
- das Frontend bekommt nur auswählbare Modelloptionen
- jede Option enthält Provider, Modellname und Fähigkeiten

Zusätzlich gilt jetzt verbindlich:
- die Modellregistry wird serverseitig aus der Laufzeitkonfiguration aufgebaut
- die Laufzeitkonfiguration liegt in `.env`
- nach dem Laden verbindet sich die UI automatisch mit dem in `.env` festgelegten Standardmodell

## Warum das zu `agent` passt
`agent` nutzt bereits OpenAI-kompatible Endpunkte und kann dadurch lokale und entfernte Modelle über dieselbe Grundlogik ansprechen.

Für `agentv2` ist derselbe Weg sinnvoll:
- OpenAI bleibt regulärer Provider
- Ollama wird als weiterer OpenAI-kompatibler Provider behandelt

## Empfohlene Zielarchitektur

### 1. Modellregistry im Backend
Der Server hält eine Liste verfügbarer Modelle, die beim Start aus `.env` gelesen und normalisiert wird.

Der Server ist die einzige Quelle der Wahrheit für:
- welche Provider aktiv sind
- welche Modelle sichtbar sind
- welches Modell Standard ist
- welches Modell beim ersten Laden automatisch verbunden wird

Beispielhaft als normalisierte Laufzeitstruktur:

```json
{
  "models": [
    {
      "id": "openai-gpt-4o-mini",
      "label": "OpenAI / gpt-4o-mini",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "apiKeyEnv": "OPENAI_API_KEY",
      "supportsTools": true,
      "supportsVision": true
    },
    {
      "id": "ollama-qwen25-14b",
      "label": "Ollama / qwen2.5:14b",
      "provider": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen2.5:14b",
      "supportsTools": true,
      "supportsVision": false
    }
  ]
}
```

Wichtig:
- API-Keys bleiben serverseitig.
- Das Frontend arbeitet nur mit `model_id`.
- Das Frontend darf Modelllisten anzeigen, aber keine Rohdaten aus `.env` bearbeiten.

### 1a. Verbindliche `.env`-Strategie
Für `agentv2` wird die Konfiguration nicht frei im UI gepflegt, sondern bewusst in `.env` festgeschrieben.

Das ist sinnvoll, weil:
- der Zielbetrieb oft lokal oder halb-stationär ist
- Provider und Modell klar vorgegeben sein sollen
- API-Keys und lokale Endpunkte nicht ins Frontend gehören
- die UI nach Reload ohne zusätzliche Eingaben direkt arbeitsfähig sein soll

### Empfohlene minimale `.env`
Für einen Ein-Provider-Betrieb reicht ein klarer Satz von Variablen:

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=your_openai_api_key_here
```

oder für Ollama:

```dotenv
LLM_PROVIDER=ollama
LLM_MODEL=qwen2.5:14b
OLLAMA_BASE_URL=http://localhost:11434/v1
```

### Empfohlene erweiterte `.env`
Für den sauberen Mehrprovider-Betrieb sollte `agentv2` mittelfristig eine explizitere Struktur bekommen:

```dotenv
DEFAULT_MODEL_ID=openai-gpt-4o-mini
AUTO_CONNECT_MODEL_ID=openai-gpt-4o-mini

OPENAI_ENABLED=true
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:14b
```

### Warum diese Struktur bevorzugt wird
- klarer als ein einziges freies Modellfeld
- gut lesbar im Betrieb
- OpenAI und Ollama gleichzeitig möglich
- erlaubt eine feste Default- und Auto-Connect-Entscheidung

### Verbindliche Regel
Wenn mehrere Provider konfiguriert sind, muss `.env` explizit festlegen:
- welches Modell Standard ist
- welches Modell beim Laden automatisch verbunden wird

Dafür soll `DEFAULT_MODEL_ID` oder ein funktional gleichwertiger Mechanismus genutzt werden.

### 2. Provider-Adapter statt harter OpenAI-Datei
Die aktuelle OpenAI-spezifische Streaming-Logik soll in einen generischen OpenAI-kompatiblen Adapter überführt werden.

Ziel:
- ein Adapter für OpenAI-kompatible Chat-Completions
- OpenAI und Ollama nur noch verschiedene Konfigurationen desselben Adapters

### 3. Modellwahl pro Chat
- Jeder Chat speichert `model_id`.
- Neue Chats übernehmen das aktuell gewählte Default-Modell.
- Alte Chats behalten ihr Modell, bis der Nutzer es bewusst ändert.

Das verhindert stille Modellwechsel mitten in einer Lage.

### 3a. Auto-Connect beim Laden
Zusätzlich gilt:
- Beim Laden der UI soll automatisch eine Verbindung zum konfigurierten Modell aufgebaut werden.
- Dafür verwendet das Frontend nicht das zuletzt frei eingetippte Modell, sondern das serverseitig konfigurierte Auto-Connect-Modell.
- Wenn das Modell erreichbar ist, wechselt der Header-Status auf `Connected`.
- Wenn das Modell nicht erreichbar ist, wechselt der Status klar auf `Error` oder `Disconnected`, mit verständlichem Hinweis.

Das System soll nach Reload also sofort betriebsbereit sein, ohne dass der Nutzer zuerst `Verbinden` klicken oder ein Modell eintragen muss.

### Aktueller Stand
- `.env` wird serverseitig über `config/env.ts` normalisiert.
- OpenAI und Ollama werden als OpenAI-kompatible Provider über dieselbe Streaming-Logik behandelt.
- Das Frontend lädt nur noch die serverseitige Modellliste und verbindet sich automatisch mit dem konfigurierten Modell.

## Wie Ollama technisch funktioniert

### Lokalbetrieb
Ollama läuft üblicherweise lokal auf dem Entwickler- oder Einsatzrechner.

Typischer Ablauf:
1. Ollama starten
2. Modell ziehen, zum Beispiel `ollama pull qwen2.5:14b`
3. `agentv2` gegen `http://localhost:11434/v1` konfigurieren

### API
Ollama bietet ein OpenAI-kompatibles Interface an.

Für `agentv2` ist deshalb wichtig:
- Base-URL konfigurierbar machen
- Modellnamen nicht hart kodieren
- Streaming gleich behandeln wie bei OpenAI

### Grenzen von Ollama
Nicht jedes Ollama-Modell unterstützt zuverlässig:
- Tool Calling
- strukturiertes JSON
- Vision
- lange Kontexte

Darum braucht jedes Modell Fähigkeitsflags.

## Fähigkeiten pro Modell

Jedes Modell in der Registry sollte später mindestens diese Informationen tragen:
- `supportsTools`
- `supportsVision`
- `supportsStreaming`
- `supportsReasoning`
- `contextWindow`
- `recommendedFor`

Damit kann das UI:
- Modelle passend kennzeichnen
- ungeeignete Modelle für Tool-lastige Modi warnen
- die Auswahl verständlicher machen

## UI-Empfehlung

### Nicht mehr nur freies Textfeld
Das aktuelle freie Eingabefeld für den Modellnamen reicht für einen echten Mehrprovider-Betrieb nicht aus.

Empfohlen ist:
- ein Dropdown oder Selector mit serverseitig gelieferten Modellen
- Anzeige von Provider und Modell im Label
- optionale Badges wie `Tools`, `Vision`, `Local`

Zusätzlich gilt:
- Wenn nur genau ein Modell aus `.env` aktiv ist, kann die UI auf einen sichtbaren Modell-Selector verzichten.
- In diesem Fall zeigt sie nur das aktive Modell und den Verbindungsstatus.
- Wenn mehrere Modelle aktiv sind, bleibt der Selector sichtbar, aber der Auto-Connect läuft trotzdem gegen das in `.env` definierte Standardmodell.

### Sichtbarer Provider im Chat
Beim Öffnen alter Chats sollte sichtbar sein:
- mit welchem Provider der Chat lief
- welches Modell aktiv war
- ob das Modell Tool Calling unterstützt

### Status oben rechts
Im Header oben rechts soll der aktuelle LLM-Zustand immer sichtbar sein.

Empfohlen sind mindestens diese Zustände:
- `Connected`
- `Connecting`
- `Streaming`
- `Disconnected`
- `Error`

Wenn möglich, sollte der Status zusätzlich den Provider oder das Modell nennen, zum Beispiel:
- `Connected · OpenAI / gpt-4o-mini`
- `Connected · Ollama / qwen2.5:14b`
- `Error · Ollama nicht erreichbar`

## Verhalten bei Ausfall eines Providers

### OpenAI nicht erreichbar
- bestehende Chats mit OpenAI zeigen klaren Fehlerstatus
- anderer Chat mit Ollama bleibt nutzbar

### Ollama nicht erreichbar
- lokale Modelle werden als `offline` markiert
- Auswahl bleibt sichtbar, aber deaktiviert oder mit Warnhinweis

Wichtig:
- Kein stilles automatisches Umschalten auf ein anderes Modell mitten in einem Chat.
- Provider-Fallback darf nur bewusst oder klar kommuniziert passieren.

## Empfohlene Schnittstellen

### HTTP
- `GET /api/models`
  liefert die verfügbare Modellliste
- `GET /api/providers/health`
  liefert Status von OpenAI und Ollama
- `GET /api/runtime-config`
  liefert nur nicht-sensitive Laufzeitinfos wie `defaultModelId`, `autoConnectModelId` und sichtbare Modelllabels

### WebSocket
- `model_selected`
- `provider_unavailable`
- `chat_stream_started`
- `chat_stream_finished`
- `llm_connected`
- `llm_connecting`
- `llm_error`

## Wichtige Betriebsdetails
- API-Keys niemals an das Frontend senden
- Ollama-Base-URL serverseitig konfigurieren
- Health-Checks getrennt je Provider erfassen
- Timeouts und Retries pro Provider einstellbar halten
- Tool Calling pro Modell explizit erlauben oder sperren
- beim Start `.env` validieren und Fehlkonfigurationen früh abbrechen
- ohne gültiges Auto-Connect-Modell darf der Server nicht still in einen unklaren Zustand booten

## Auto-Connect beim UI-Start

## Verbindliche UX-Regel
Nach jedem Neuladen soll `agentv2` selbstständig versuchen, sich mit dem eingerichteten LLM zu verbinden.

Das bedeutet:
1. UI startet.
2. Backend liefert Session-Snapshot und Laufzeitmodell.
3. Frontend öffnet WebSocket.
4. Backend versucht sofort, das konfigurierte Modell zu initialisieren oder zu validieren.
5. Header zeigt `Connecting`.
6. Bei Erfolg wechselt der Status auf `Connected`.
7. Bei Fehlschlag wechselt der Status auf `Error` oder `Disconnected`.

### Warum das wichtig ist
- der Nutzer muss nicht nach jedem Reload erneut auf `Verbinden` drücken
- die Oberfläche wirkt wie ein echtes Arbeitswerkzeug statt wie ein Labor-Frontend
- Fehlkonfigurationen werden sofort sichtbar

## Verhalten bei nur einem konfigurierten Modell
- dieses Modell ist automatisch `DEFAULT_MODEL_ID`
- dieses Modell ist automatisch `AUTO_CONNECT_MODEL_ID`
- die UI verbindet sich immer direkt damit

## Verhalten bei mehreren konfigurierten Modellen
- `.env` legt ein Auto-Connect-Modell fest
- die UI verbindet sich beim Laden zunächst mit diesem Modell
- der Nutzer kann später auf andere erlaubte Modelle umschalten
- bestehende Chats behalten trotzdem ihr gespeichertes `model_id`

## Was vor der Umsetzung noch geklärt werden muss
- Welche Ollama-Modelle offiziell unterstützt werden sollen
- Ob Modellwechsel innerhalb eines bestehenden Chats erlaubt oder nur für neue Chats empfohlen werden
- Ob zusätzlich zur `.env` später noch eine produktionsnahe Datei wie `config.json` sinnvoll ist oder `.env` dauerhaft die führende Quelle bleibt
