## CommandX MCP Starter

Schnelles FastMCP-Template mit ausgelagerten Tool-Modulen.

### Struktur

- `main.py`: erstellt den `FastMCP`-Server und startet ihn
- `generic/__init__.py`: bündelt Tool-Registrierungen
- `generic/time.py`: Beispiel für ein ausgelagertes Tool-Modul

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
uv run --group dev pytest tests/test_time.py
```

Mit ausführlicher Ausgabe:

```bash
uv run --group dev pytest tests/ -v
```

### Neue Tools hinzufügen

Lege eine neue Datei an, z. B. `generic/foo.py`:

```python
from mcp.server.fastmcp import FastMCP


def my_tool() -> str:
    return "ok"


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(my_tool, name="my_tool")
```

Dann in `generic/__init__.py` registrieren:

```python
from .foo import register_tools as register_foo_tools


def register_generic_tools(mcp: FastMCP) -> None:
    register_foo_tools(mcp)
```
