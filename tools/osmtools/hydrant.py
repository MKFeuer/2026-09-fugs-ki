import math
import httpx
from datetime import datetime
from mcp.server.fastmcp import FastMCP

NOMINATIM_URL = "https://nominatim.openstreetmap.org"
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
_HEADERS = {"User-Agent": "FugsKI-HydrantTool/1.0"}

_FLOW_FALLBACK: dict[str, int] = {
    "underground": 800,
    "pillar": 1200,
    "wall": 600,
    "pond": 2000,
    "water_tank": 1600,
    "suction_point": 2000,
}

_TYPE_LABEL: dict[str, str] = {
    "underground": "Underground Hydrant",
    "pillar": "Pillar Hydrant",
    "wall": "Wall Hydrant",
    "pond": "Fire Pond",
    "water_tank": "Water Tank",
    "suction_point": "Suction Point",
}

_BEARING_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    dlon = math.radians(lon2 - lon1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(dlon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    deg = (math.degrees(math.atan2(x, y)) + 360) % 360
    return _BEARING_LABELS[round(deg / 45) % 8]


def _parse_flow_rate(raw: str | None, typ: str = "underground") -> tuple[int, bool]:
    if not raw:
        return _FLOW_FALLBACK.get(typ, 800), True
    s = raw.strip().lower()
    try:
        if "m³/h" in s or "m3/h" in s:
            val = float(s.replace("m³/h", "").replace("m3/h", "").strip())
            return int(val * 1000 / 60), False
        if "l/h" in s:
            return int(float(s.replace("l/h", "").strip()) / 60), False
        if "l/min" in s:
            return int(float(s.replace("l/min", "").strip())), False
        return int(float(s)), False
    except ValueError:
        return _FLOW_FALLBACK.get(typ, 800), True


def _hose_count(lay_m: float) -> int:
    return math.ceil(lay_m / 20)


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
    return {
        "lat": float(data[0]["lat"]),
        "lon": float(data[0]["lon"]),
        "address": data[0].get("display_name", location),
    }


async def _reverse_geocode(lat: float, lon: float) -> str:
    async with httpx.AsyncClient(headers=_HEADERS) as client:
        r = await client.get(
            f"{NOMINATIM_URL}/reverse",
            params={"lat": lat, "lon": lon, "format": "json"},
        )
        r.raise_for_status()
        data = r.json()
    return data.get("display_name", f"{lat:.5f}, {lon:.5f}")


async def _find_hydrants(lat: float, lon: float, radius: int) -> list[dict]:
    query = f"""
(
  node["emergency"="fire_hydrant"](around:{radius},{lat},{lon});
  node["emergency"="water_tank"](around:{radius},{lat},{lon});
  node["emergency"="suction_point"](around:{radius},{lat},{lon});
);
out body;
"""
    full = f"[out:json][timeout:30];\n{query}"
    last_err = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                r = await client.post(endpoint, data={"data": full})
                r.raise_for_status()
                elements = r.json().get("elements", [])
                break
        except Exception as e:
            last_err = e
    else:
        raise ConnectionError(f"Overpass server unreachable: {last_err}")

    hydrants = []
    for el in elements:
        tags = el.get("tags", {})
        hlat, hlon = el["lat"], el["lon"]
        emergency = tags.get("emergency", "fire_hydrant")
        h_type = tags.get("fire_hydrant:type") or emergency
        flow_raw = tags.get("flow_rate") or tags.get("fire_hydrant:flow_rate")
        flow, estimated = _parse_flow_rate(flow_raw, h_type)
        distance = _haversine(lat, lon, hlat, hlon)
        lay = distance * 1.5
        score = flow / (distance + 1)
        street = tags.get("addr:street") or tags.get("name") or ""
        number = tags.get("addr:housenumber") or ""
        location_str = f"{street} {number}".strip() or "no address in OSM"
        hydrants.append({
            "id": el["id"],
            "lat": hlat,
            "lon": hlon,
            "type": h_type,
            "label": _TYPE_LABEL.get(h_type, _TYPE_LABEL.get(emergency, "Hydrant")),
            "flow": flow,
            "estimated": estimated,
            "distance_m": round(distance),
            "lay_m": round(lay),
            "hoses": _hose_count(lay),
            "bearing": _bearing(lat, lon, hlat, hlon),
            "location": location_str,
            "score": score,
        })

    return sorted(hydrants, key=lambda h: -h["score"])


def _format_report(address: str, lat: float, lon: float, radius: int,
                   hydrants: list[dict], max_results: int = 30) -> str:
    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")
    total = len(hydrants)
    hydrants = hydrants[:max_results]
    lines = [
        "═" * 55,
        f"  HYDRANT SITUATION REPORT  •  {ts}",
        "═" * 55,
        f"  Incident location : {address[:50]}",
        f"  Coordinates       : {lat:.5f}° N / {lon:.5f}° E",
        f"  Search radius     : {radius} m",
        "",
    ]

    if not hydrants:
        lines += [
            "  NO water supply points found within search radius.",
            "  → Increase radius or verify water supply manually.",
            "═" * 55,
        ]
        return "\n".join(lines)

    count_str = f"{len(hydrants)} of {total}" if total > len(hydrants) else str(total)
    lines.append(f"  WATER SUPPLY POINTS — {count_str} (sorted by score)")
    lines.append("─" * 55)

    for i, h in enumerate(hydrants, 1):
        tag = "★ RECOMMENDED  •  " if i == 1 else ""
        est = " (estimated)" if h["estimated"] else ""
        lines += [
            "",
            f"  [{i}] {tag}{h['label']}",
            f"      Distance  : {h['distance_m']} m  |  Bearing: {h['bearing']}",
            f"      Flow rate : {h['flow']} l/min{est}",
            f"      Hose lay  : {h['lay_m']} m  →  {h['hoses']}× B-hose (20 m)",
            f"      Location  : {h['location']}",
            f"      GPS       : {h['lat']:.5f}, {h['lon']:.5f}",
            f"      OSM       : https://www.openstreetmap.org/node/{h['id']}",
        ]

    best = hydrants[0]
    lines += [
        "",
        "─" * 55,
        "  TACTICAL RECOMMENDATION",
        f"  Primary : {best['label']} [{best['bearing']}], {best['distance_m']} m",
        f"  Hose lay: {best['lay_m']} m  —  lay {best['hoses']}× B-hose (20 m)",
        f"  Water   : {best['flow']} l/min{'*' if best['estimated'] else ''}",
        "═" * 55,
    ]
    if any(h["estimated"] for h in hydrants):
        lines.append("  * Estimated — no flow_rate tag in OSM")

    return "\n".join(lines)


async def analysiere_hydranten(einsatzort: str, radius_m: int = 300, max_ergebnisse: int = 10) -> str:
    """Generates a tactical hydrant situation report for an incident location.
    Searches for fire hydrants, water tanks and suction points within the radius.
    Calculates hose requirements and returns a prioritized tactical recommendation.

    IMPORTANT FOR THE AGENT: If the result contains "NO water supply points found",
    immediately retry with a larger radius: 500 m → 1000 m → 2000 m.
    Do not wait for user input — retry autonomously until results are found.
    """
    geo = await _geocode(einsatzort)
    hydrants = await _find_hydrants(geo["lat"], geo["lon"], radius_m)
    return _format_report(geo["address"], geo["lat"], geo["lon"], radius_m, hydrants, max_results=max_ergebnisse)


async def berechne_schlauchbedarf(
    einsatzort: str,
    hydrant_lat: float,
    hydrant_lon: float,
) -> str:
    """Calculates hose requirements between an incident location and a known hydrant.
    Returns straight-line distance, hose lay distance (×1.5) and number of B-hoses.
    """
    geo = await _geocode(einsatzort)
    straight = _haversine(geo["lat"], geo["lon"], hydrant_lat, hydrant_lon)
    lay = straight * 1.5
    hoses = _hose_count(lay)
    dir_ = _bearing(geo["lat"], geo["lon"], hydrant_lat, hydrant_lon)
    hydrant_addr = await _reverse_geocode(hydrant_lat, hydrant_lon)
    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")
    return "\n".join([
        "═" * 55,
        f"  HOSE REQUIREMENTS  •  {ts}",
        "═" * 55,
        f"  Incident location : {geo['address'][:50]}",
        f"  Hydrant           : {hydrant_addr[:50]}",
        f"  Bearing           : {dir_}",
        f"  Straight-line     : {round(straight)} m",
        f"  Hose lay          : {round(lay)} m  (factor 1.5)",
        f"  B-hoses           : {hoses}× at 20 m each",
        "═" * 55,
    ])


async def geocode_ort(ort: str) -> str:
    """Resolves a place name or address to GPS coordinates via Nominatim."""
    geo = await _geocode(ort)
    return "\n".join([
        f"Address     : {geo['address']}",
        f"Coordinates : {geo['lat']:.6f}° N / {geo['lon']:.6f}° E",
        f"OSM map     : https://www.openstreetmap.org/#map=17/{geo['lat']}/{geo['lon']}",
    ])


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        analysiere_hydranten,
        name="analyze_hydrants",
        description=(
            "Generates a tactical hydrant situation report for an incident location (address or place name). "
            "Searches for fire hydrants, water tanks, and suction points within the given radius (default 300 m). "
            "Calculates hose requirements and returns a prioritized tactical recommendation. "
            "If no results are found, automatically retry with a larger radius: 500 m → 1000 m → 2000 m."
        ),
    )
    mcp.add_tool(
        berechne_schlauchbedarf,
        name="calculate_hose_requirements",
        description=(
            "Calculates hose requirements between an incident location and a known hydrant (GPS coordinates). "
            "Returns straight-line distance, hose lay distance (×1.5 detour factor), and number of B-hoses (20 m each)."
        ),
    )
    mcp.add_tool(
        geocode_ort,
        name="geocode_location",
        description=(
            "Resolves a place name or address to GPS coordinates and a verified address string "
            "via OpenStreetMap Nominatim."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        print(await geocode_ort("Marienplatz, München"))
        print()
        print(await analysiere_hydranten("Marienplatz 1, München", radius_m=300))

    asyncio.run(main())
