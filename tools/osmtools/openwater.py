import math
import httpx
from datetime import datetime
from mcp.server.fastmcp import FastMCP

NOMINATIM_URL = "https://nominatim.openstreetmap.org"
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
_HEADERS = {"User-Agent": "FugsKI-OpenWaterTool/1.0"}

_MAX_SUCTION_HEIGHT_M = 7.5   # FPN pump standard max suction lift
_ROAD_ACCESS_RADIUS_M = 50    # max distance from water edge to nearest road

_TYPE_LABEL: dict[str, str] = {
    "water":          "Natural water body (lake/pond)",
    "river":          "River",
    "canal":          "Canal",
    "stream":         "Stream",
    "swimming_pool":  "Swimming pool",
    "reservoir":      "Reservoir",
    "basin":          "Basin",
    "ditch":          "Ditch",
}


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def _geocode(location: str) -> dict:
    async with httpx.AsyncClient(headers=_HEADERS) as client:
        r = await client.get(
            f"{NOMINATIM_URL}/search",
            params={"q": location, "format": "json", "limit": 1, "countrycodes": "de"},
        )
        r.raise_for_status()
        data = r.json()
    if not data:
        raise ValueError(f"Location not found: {location!r}")
    return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"]),
            "address": data[0].get("display_name", location)}


async def _query_overpass(query: str) -> list[dict]:
    full = f"[out:json][timeout:30];\n{query}"
    last_err = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                r = await client.post(endpoint, data={"data": full})
                r.raise_for_status()
                return r.json().get("elements", [])
        except Exception as e:
            last_err = e
    raise ConnectionError(f"Overpass server unreachable: {last_err}")


async def _find_open_water(lat: float, lon: float, radius: int) -> list[dict]:
    query = f"""
(
  node["natural"="water"](around:{radius},{lat},{lon});
  way["natural"="water"](around:{radius},{lat},{lon});
  node["waterway"~"river|canal|stream"](around:{radius},{lat},{lon});
  way["waterway"~"river|canal|stream"](around:{radius},{lat},{lon});
  node["leisure"="swimming_pool"](around:{radius},{lat},{lon});
  way["leisure"="swimming_pool"](around:{radius},{lat},{lon});
  node["man_made"="reservoir"](around:{radius},{lat},{lon});
  way["man_made"="reservoir"](around:{radius},{lat},{lon});
  node["man_made"="basin"](around:{radius},{lat},{lon});
  way["man_made"="basin"](around:{radius},{lat},{lon});
);
out center;
"""
    elements = await _query_overpass(query)

    sources = []
    for el in elements:
        tags = el.get("tags", {})
        # get center coordinates (ways return center)
        if el["type"] == "way":
            center = el.get("center", {})
            wlat = center.get("lat")
            wlon = center.get("lon")
        else:
            wlat = el.get("lat")
            wlon = el.get("lon")
        if wlat is None or wlon is None:
            continue

        water_type = (tags.get("natural") or tags.get("waterway") or
                      tags.get("leisure") or tags.get("man_made") or "water")
        name = tags.get("name") or ""
        distance = _haversine(lat, lon, wlat, wlon)

        # Estimate suction hose count (2m sections, assume ~1m bank height)
        suction_sections = math.ceil(1.5 / 2) + 1  # minimum practical
        depth = tags.get("depth") or tags.get("maxdepth")

        sources.append({
            "id": el["id"],
            "osm_type": el["type"],
            "lat": wlat,
            "lon": wlon,
            "type": water_type,
            "label": _TYPE_LABEL.get(water_type, water_type.title()),
            "name": name,
            "distance_m": round(distance),
            "suction_sections": suction_sections,
            "depth_tag": depth or "unknown",
            "score": 1 / (distance + 1),
        })

    return sorted(sources, key=lambda s: -s["score"])


async def find_open_water(location: str, radius_m: int = 1000) -> str:
    """Finds natural and artificial open water sources near an incident location.

    Searches for lakes, ponds, rivers, canals, swimming pools and reservoirs.
    Useful as backup water supply when hydrant coverage is insufficient.
    Returns distance, type and suction setup requirements.

    AGENT: Use as backup if analyze_hydrants() finds no results or distance is very large.
    If no results, retry with a larger radius: 1000 m → 2000 m → 5000 m.
    """
    geo = await _geocode(location)
    sources = await _find_open_water(geo["lat"], geo["lon"], radius_m)

    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")
    lines = [
        "═" * 55,
        f"  OPEN WATER SOURCES  •  {ts}",
        "═" * 55,
        f"  Incident location : {geo['address'][:50]}",
        f"  Coordinates       : {geo['lat']:.5f}° N / {geo['lon']:.5f}° E",
        f"  Search radius     : {radius_m} m",
        "",
    ]

    if not sources:
        lines += [
            "  NO open water sources found within search radius.",
            "  → Increase radius or consider long-distance water shuttle.",
            "═" * 55,
        ]
        return "\n".join(lines)

    lines.append(f"  OPEN WATER SOURCES — {len(sources)} found")
    lines.append("─" * 55)

    for i, s in enumerate(sources, 1):
        tag = "★ NEAREST  •  " if i == 1 else ""
        name_str = f" ({s['name']})" if s["name"] else ""
        lines += [
            "",
            f"  [{i}] {tag}{s['label']}{name_str}",
            f"      Distance       : {s['distance_m']} m",
            f"      Depth (OSM tag): {s['depth_tag']}",
            f"      GPS            : {s['lat']:.5f}, {s['lon']:.5f}",
            f"      OSM            : https://www.openstreetmap.org/{s['osm_type']}/{s['id']}",
        ]

    lines += [
        "",
        "─" * 55,
        "  SUCTION SETUP NOTES",
        f"  Max suction lift    : {_MAX_SUCTION_HEIGHT_M} m (FPN pump standard)",
        "  Suction hose length : assess on site — pump must be within reach of water",
        "  Road access         : verify truck can reach water's edge before committing",
        "  Flow rate estimate  : rivers/canals ≥ 800 l/min, ponds/pools: depends on size",
        "═" * 55,
    ]
    return "\n".join(lines)


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        find_open_water,
        name="find_open_water",
        description=(
            "Finds natural and artificial open water sources (lakes, rivers, pools, reservoirs) "
            "near an incident location. Useful as backup water supply when hydrant coverage is "
            "insufficient or distance to hydrants is too large. "
            "If no results found, retry with larger radius: 1000 m → 2000 m → 5000 m."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        print(await find_open_water("Starnberg, Bayern", radius_m=500))

    asyncio.run(main())
