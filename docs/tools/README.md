## MCP Tools

FastMCP-Server mit Geo- und Zeitwerkzeugen.

### Struktur

- `main.py`: erstellt den `FastMCP`-Server und startet ihn
- `geotools/geo.py`: geodätische Distanzberechnung (WGS84)
- `generic/time.py`: aktuelle Uhrzeit als String

### Starten

```bash
uv run python main.py
```

### Tests

Tests liegen in `tests/` und werden mit [pytest](https://pytest.org) ausgeführt.

```bash
uv run --group dev pytest tests/
```

Einzelnen Test ausführen:

```bash
uv run --group dev pytest tests/test_geo.py
```

Mit ausführlicher Ausgabe:

```bash
uv run --group dev pytest tests/ -v
```

### Neue Tools hinzufügen

Lege eine neue Datei an, z. B. `geotools/elevation.py`, und registriere sie in `geotools/__init__.py`.
