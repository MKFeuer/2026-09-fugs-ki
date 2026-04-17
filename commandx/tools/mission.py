from typing import Any
from mcp.server.fastmcp import FastMCP
from client import CIMgateClient
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("commandx")

client = CIMgateClient()

def get_missions(
    is_deleted: bool = False,
    is_locked: bool | None = None,
    els: bool | None = None,
    is_takenover: bool | None = None,
    has_end_date: bool | None = None,
    start_date_min: str | None = None,
) -> list[dict]:
    log.info("TOOL  get_missions  is_deleted=%s is_locked=%s els=%s is_takenover=%s has_end_date=%s start_date_min=%s", is_deleted, is_locked, els, is_takenover, has_end_date, start_date_min)
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


def get_mission(mission_id: str) -> dict:
    log.info("TOOL  get_mission  mission_id=%s", mission_id)
    return client.get(f"Mission/{mission_id}")


def get_mission_by_external_id(external_id: str) -> dict:
    log.info("TOOL  get_mission_by_external_id  external_id=%s", external_id)
    return client.get(f"Mission/ExternalID/{external_id}")


def get_mission_resources(mission_id: str) -> list[dict]:
    log.info("TOOL  get_mission_resources  mission_id=%s", mission_id)
    return client.get(f"mission/{mission_id}/mission-resource")


def get_mission_messages(mission_id: str) -> list[dict]:
    log.info("TOOL  get_mission_messages  mission_id=%s", mission_id)
    return client.get(f"mission/{mission_id}/message")


def get_active_missions() -> list[dict]:
    log.info("TOOL  get_active_missions")
    params = {
        "isDeleted": "false",
        "isLocked": "false",
        "HasEndDate": "false",
    }
    return client.get("Mission", params=params)


def get_missions_since(iso_date: str) -> list[dict]:
    log.info("TOOL  get_missions_since  iso_date=%s", iso_date)
    params = {
        "isDeleted": "false",
        "StartDateMin": iso_date,
    }
    return client.get("Mission", params=params)


def register_mission_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        get_missions,
        name="get_missions",
        description="""Gibt alle Einsätze (Missions) zurück.

    Args:
        is_deleted:    Gelöschte Einsätze einschließen (Standard: False)
        is_locked:     Nur gesperrte / nicht-gesperrte Einsätze (None = kein Filter)
        els:           Nur ELS-Einsätze (None = kein Filter)
        is_takenover:  Nur übernommene Einsätze (None = kein Filter)
        has_end_date:  Nur Einsätze mit/ohne Enddatum (None = kein Filter)
        start_date_min: Einsätze ab diesem Datum, ISO 8601 z.B. "2026-01-01T00:00:00Z\"""",
    )
    mcp.add_tool(
        get_mission,
        name="get_mission",
        description="""Gibt einen einzelnen Einsatz anhand seiner ID zurück.

    Args:
        mission_id: GUID des Einsatzes""",
    )
    mcp.add_tool(
        get_mission_by_external_id,
        name="get_mission_by_external_id",
        description="""Gibt einen Einsatz anhand seiner ExternalID zurück.

    Args:
        external_id: Externe ID des Einsatzes""",
    )
    mcp.add_tool(
        get_mission_resources,
        name="get_mission_resources",
        description="""Gibt alle eingesetzten Kräfte/Fahrzeuge (MissionResources) eines Einsatzes zurück.

    Args:
        mission_id: GUID des Einsatzes""",
    )
    mcp.add_tool(
        get_mission_messages,
        name="get_mission_messages",
        description="""Gibt alle Nachrichten eines Einsatzes zurück.

    Args:
        mission_id: GUID des Einsatzes""",
    )
    mcp.add_tool(
        get_active_missions,
        name="get_active_missions",
        description="""Gibt alle aktiven (nicht gelöschten, nicht gesperrten) Einsätze ohne Enddatum zurück.
    Kurzform für den häufigsten Anwendungsfall.""",
    )
    mcp.add_tool(
        get_missions_since,
        name="get_missions_since",
        description="""Gibt alle Einsätze ab einem bestimmten Datum zurück.

    Args:
        iso_date: Startdatum im ISO-8601-Format, z.B. "2026-04-01T00:00:00Z\"""",
    )

