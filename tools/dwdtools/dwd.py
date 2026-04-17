from mcp.server.fastmcp import FastMCP
import httpx
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

BASE_URL = "https://app-prod-ws.warnwetter.de/v30/"
MISSING_VALUE = 32767
FIXED_STATION_ID = "03379"


def _decode_temperature_series(station_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    forecast = station_data["forecast1"]
    start_ms = forecast["start"]
    step_ms = forecast["timeStep"]
    temps = forecast["temperature"]

    series: List[Dict[str, Any]] = []
    for idx, raw in enumerate(temps):
        ts_ms = start_ms + idx * step_ms
        ts = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)

        if raw == MISSING_VALUE:
            value_c: Optional[float] = None
        else:
            value_c = raw / 10.0

        series.append(
            {
                "ts": ts,
                "value_raw": raw,
                "value_c": value_c,
            }
        )
    return series


def _get_current_and_next_12h_for_fixed_station() -> Dict[str, Any]:
    url = f"{BASE_URL}stationOverviewExtended"
    params = {"stationIds": FIXED_STATION_ID}

    with httpx.Client(timeout=20) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    if not data:
        raise ValueError("Leere API-Antwort von stationOverviewExtended")

    station_id = next(iter(data.keys()))
    station_data = data[station_id]

    series = _decode_temperature_series(station_data)
    if not series:
        raise ValueError("Keine Temperaturdaten in der Antwort")

    current = series[0]
    next_12 = series[1:13]

    def to_output_item(item: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "timestamp": item["ts"].isoformat().replace("+00:00", "Z"),
            "temperature_c": item["value_c"],
        }

    return {
        "station_id": station_id,
        "current": to_output_item(current),
        "next_12h": [to_output_item(it) for it in next_12],
    }


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        _get_current_and_next_12h_for_fixed_station,
        name="get_current_and_next_12h_munich",
        description=(
            "This tool fetches the current temperature and the forecast for the next 12 hours for a fixed station in Munich from the DWD API. "
            "The output includes the station ID, the current temperature with timestamp, and a list of the next 12 hours' temperatures with their timestamps."
        ),
    )
