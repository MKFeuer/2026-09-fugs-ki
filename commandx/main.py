"""
MCP Server für die CIMgate.Connect REST API (CommandX).

Konfiguration via Umgebungsvariablen:
    COMMANDX_HOST                  z.B. "192.168.1.100:7000"
    COMMANDX_SECURITY_HEADER_NAME  Name des Custom-Security-Headers (aus CIMgate-UI)
    COMMANDX_SECURITY_HEADER_VALUE Wert des Custom-Security-Headers (aus CIMgate-UI)
    COMMANDX_BEARER_TOKEN          Statischer Bearer-Token
    COMMANDX_VERIFY_SSL            "false" um SSL-Zertifikat-Prüfung zu deaktivieren (optional)
    COMMANDX_USER_AGENT            User-Agent Header (Standard: "insomnia/12.5.0")

Starten:
    uv run commandx/main.py
"""

import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from client import CIMgateClient
from generic import register_generic_tools

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("commandx")

client = CIMgateClient()

# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------

mcp = FastMCP("CommandX – CIMgate.Connect", json_response=True, host="0.0.0.0", port=8000)

@mcp.tool()
def get_missions(
    is_deleted: bool = False,
    is_locked: Optional[bool] = None,
    els: Optional[bool] = None,
    is_takenover: Optional[bool] = None,
    has_end_date: Optional[bool] = None,
    start_date_min: Optional[str] = None,
) -> list[dict]:
    log.info("TOOL  get_missions  is_deleted=%s is_locked=%s els=%s is_takenover=%s has_end_date=%s start_date_min=%s", is_deleted, is_locked, els, is_takenover, has_end_date, start_date_min)
    """
    Gibt alle Einsätze (Missions) zurück.

    Args:
        is_deleted:    Gelöschte Einsätze einschließen (Standard: False)
        is_locked:     Nur gesperrte / nicht-gesperrte Einsätze (None = kein Filter)
        els:           Nur ELS-Einsätze (None = kein Filter)
        is_takenover:  Nur übernommene Einsätze (None = kein Filter)
        has_end_date:  Nur Einsätze mit/ohne Enddatum (None = kein Filter)
        start_date_min: Einsätze ab diesem Datum, ISO 8601 z.B. "2026-01-01T00:00:00Z"
    """
    params: dict[str, Any] = {"isDeleted": str(is_deleted).lower()}

    if is_locked is not None:
        params["isLocked"] = str(is_locked).lower()
    if els is not None:
        params["Els"] = str(els).lower()
    if is_takenover is not None:
        params["isTakenover"] = str(is_takenover).lower()
    if has_end_date is not None:
        params["HasEndDate"] = str(has_end_date).lower()
    if start_date_min is not None:
        params["StartDateMin"] = start_date_min

    return client.get("Mission", params=params)


@mcp.tool()
def get_mission(mission_id: str) -> dict:
    """
    Gibt einen einzelnen Einsatz anhand seiner ID zurück.

    Args:
        mission_id: GUID des Einsatzes
    """
    log.info("TOOL  get_mission  mission_id=%s", mission_id)
    return client.get(f"Mission/{mission_id}")


@mcp.tool()
def get_mission_by_external_id(external_id: str) -> dict:
    """
    Gibt einen Einsatz anhand seiner ExternalID zurück.

    Args:
        external_id: Externe ID des Einsatzes
    """
    log.info("TOOL  get_mission_by_external_id  external_id=%s", external_id)
    return client.get(f"Mission/ExternalID/{external_id}")


@mcp.tool()
def get_mission_resources(mission_id: str) -> list[dict]:
    """
    Gibt alle eingesetzten Kräfte/Fahrzeuge (MissionResources) eines Einsatzes zurück.

    Args:
        mission_id: GUID des Einsatzes
    """
    log.info("TOOL  get_mission_resources  mission_id=%s", mission_id)
    return client.get(f"mission/{mission_id}/mission-resource")


@mcp.tool()
def get_mission_messages(mission_id: str) -> list[dict]:
    """
    Gibt alle Nachrichten eines Einsatzes zurück.

    Args:
        mission_id: GUID des Einsatzes
    """
    log.info("TOOL  get_mission_messages  mission_id=%s", mission_id)
    return client.get(f"mission/{mission_id}/message")


@mcp.tool()
def get_active_missions() -> list[dict]:
    """
    Gibt alle aktiven (nicht gelöschten, nicht gesperrten) Einsätze ohne Enddatum zurück.
    Kurzform für den häufigsten Anwendungsfall.
    """
    log.info("TOOL  get_active_missions")
    params = {
        "isDeleted": "false",
        "isLocked": "false",
        "HasEndDate": "false",
    }
    return client.get("Mission", params=params)


@mcp.tool()
def get_missions_since(iso_date: str) -> list[dict]:
    """
    Gibt alle Einsätze ab einem bestimmten Datum zurück.

    Args:
        iso_date: Startdatum im ISO-8601-Format, z.B. "2026-04-01T00:00:00Z"
    """
    log.info("TOOL  get_missions_since  iso_date=%s", iso_date)
    params = {
        "isDeleted": "false",
        "StartDateMin": iso_date,
    }
    return client.get("Mission", params=params)


@mcp.tool()
def get_alarm_keywords() -> list[dict]:
    """Gibt alle konfigurierten Alarmstichworte zurück."""
    log.info("TOOL  get_alarm_keywords")
    return client.get("alarm-keyword")


@mcp.tool()
def get_departments() -> list[dict]:
    """Gibt alle Abteilungen/Organisationen zurück."""
    log.info("TOOL  get_departments")
    return client.get("Department")


if __name__ == "__main__":
    mcp.run(transport="streamable-http")