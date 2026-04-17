import requests
from typing import Optional

from mcp.server.fastmcp import FastMCP

BBOX_MUNICH = [47.8500, 11.1500, 48.4500, 12.0500]  # min_lat, min_lon, max_lat, max_lon

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def overpass_query(
    query: str,
    bbox: Optional[list[float]] = None,  # defaults to Munich if omitted
    timeout: int = 60,
) -> dict:
    """Execute an Overpass QL query and return the result as a dict.

    query: Overpass QL query string. Use {bbox} as placeholder for the bounding box.
    bbox: Optional bounding box as [min_lat, min_lon, max_lat, max_lon].
    timeout: Query timeout in seconds.
    """
    if bbox is None:
        bbox = BBOX_MUNICH
    if bbox:
        bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
        query = query.replace("{bbox}", bbox_str)

    full_query = f"[out:json][timeout:{timeout}];\n{query}"

    last_error = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            response = requests.post(
                endpoint,
                data={"data": full_query},
                timeout=timeout + 10,
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            last_error = e
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            pass

    raise ConnectionError(f"Alle Overpass-Server nicht erreichbar. Letzter Fehler: {last_error}")


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        overpass_query,
        name="osm_overpass_query",
        description=(
            "Executes an Overpass QL query against OpenStreetMap and returns the matching elements. "
            "Use {bbox} in the query string as a placeholder when providing a bounding box. "
            "bbox must be [min_lat, min_lon, max_lat, max_lon]."
        ),
    )


if __name__ == "__main__":
    query = """
    node["amenity"="cafe"]({bbox});
    out center;
    """
    bbox_berlin = [52.3383, 13.0884, 52.6755, 13.7611]
    data = overpass_query(query, bbox=bbox_berlin)
    elements = data.get("elements", [])
    print(f"{len(elements)} Cafés in München gefunden.")
