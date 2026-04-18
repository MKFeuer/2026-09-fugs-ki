"""
Routing and road-planning tools for emergency operations.
Provides route geometry, access road analysis, and staging area search.
"""
import math
import json
import httpx
from mcp.server.fastmcp import FastMCP

from osmtools.hydrant import _geocode
from osmtools.osm import overpass_query

OSRM_BASE = "http://router.project-osrm.org/route/v1/driving"

# Highway types accessible for fire trucks (with tractability rating)
_FW_ACCESSIBLE = {
    "motorway": "eingeschränkt (Autobahn, nur mit Genehmigung)",
    "trunk": "ja",
    "primary": "ja",
    "secondary": "ja",
    "tertiary": "ja",
    "unclassified": "ja",
    "residential": "ja (Fahrbahnbreite prüfen)",
    "service": "eingeschränkt",
    "living_street": "eingeschränkt (Schrittgeschwindigkeit)",
    "track": "nur leichte Fahrzeuge",
    "path": "nein",
    "cycleway": "nein",
    "footway": "nein",
    "pedestrian": "nein",
}

_BEARING_LABELS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]


def _bearing_label(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    dlon = math.radians(lon2 - lon1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(dlon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    deg = (math.degrees(math.atan2(x, y)) + 360) % 360
    return _BEARING_LABELS[round(deg / 45) % 8]


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _parse_capacity(raw: str | None) -> int | None:
    if raw is None:
        return None
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


async def _parse_location(location: str) -> dict:
    """Parse 'lat,lon' string or geocode an address."""
    stripped = location.strip()
    parts = stripped.split(",")
    if len(parts) == 2:
        try:
            lat = float(parts[0].strip())
            lon = float(parts[1].strip())
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return {"lat": lat, "lon": lon, "address": stripped}
        except ValueError:
            pass
    return await _geocode(stripped)


async def _osrm_route(lat1: float, lon1: float, lat2: float, lon2: float) -> dict | None:
    """Call OSRM with full GeoJSON geometry. Returns route dict or None on failure."""
    url = (
        f"{OSRM_BASE}/{lon1},{lat1};{lon2},{lat2}"
        "?overview=full&geometries=geojson&steps=false"
    )
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            if data.get("code") != "Ok" or not data.get("routes"):
                return None
            return data["routes"][0]
    except Exception:
        return None


def _simplify_geometry(coords: list[list[float]], max_points: int = 60) -> list[dict]:
    """Convert GeoJSON [lon,lat] coords to [{lat,lng}] and simplify if too long."""
    points = [{"lat": round(c[1], 6), "lng": round(c[0], 6)} for c in coords]
    if len(points) <= max_points:
        return points
    # Evenly sample max_points from the list, always keeping first and last
    step = (len(points) - 1) / (max_points - 1)
    indices = {round(i * step) for i in range(max_points)}
    indices.add(0)
    indices.add(len(points) - 1)
    return [points[i] for i in sorted(indices)]


async def get_route(
    from_location: str,
    to_location: str,
) -> str:
    """Plans a driving route between two locations and returns route geometry for map plotting.

    from_location / to_location: address string (e.g. 'Marienplatz 1, München')
    or 'lat,lon' string (e.g. '48.1374, 11.5755').

    Returns:
    - Route summary (distance, drive time, road names)
    - JSON waypoints array → pass directly to canvas_map_add_route as 'points'

    AGENT: After calling this tool, use canvas_map_add_route with the waypoints
    to draw the route on the map. Mark the origin with kind='staging' when it is a
    Bereitstellungsraum, the destination incident with kind='fire', and planned
    vehicle positions along the route with kind='firetruck' / 'ladder' / 'command'.
    """
    try:
        origin = await _parse_location(from_location)
        dest = await _parse_location(to_location)
    except Exception as e:
        return f"Geocoding-Fehler: {e}"

    route = await _osrm_route(origin["lat"], origin["lon"], dest["lat"], dest["lon"])

    if route is None:
        straight = _haversine(origin["lat"], origin["lon"], dest["lat"], dest["lon"])
        bearing = _bearing_label(origin["lat"], origin["lon"], dest["lat"], dest["lon"])
        return (
            f"OSRM nicht erreichbar — Luftlinie: {round(straight)} m ({bearing})\n"
            f"Von: {origin['address']}\n"
            f"Nach: {dest['address']}\n"
            "Waypoints nicht verfügbar."
        )

    distance_m = round(route["distance"])
    duration_min = route["duration"] / 60
    coords = route["geometry"]["coordinates"]
    waypoints = _simplify_geometry(coords)

    bearing = _bearing_label(origin["lat"], origin["lon"], dest["lat"], dest["lon"])
    waypoints_json = json.dumps(waypoints, separators=(",", ":"))

    return "\n".join([
        "═" * 55,
        "  STRECKENFÜHRUNG (OSRM)",
        "═" * 55,
        f"  Von     : {origin['address'][:52]}",
        f"  Nach    : {dest['address'][:52]}",
        f"  Richtung: {bearing}",
        "─" * 55,
        f"  Distanz : {distance_m:,} m  ({distance_m / 1000:.1f} km)",
        f"  Fahrzeit: {duration_min:.1f} min  (OSRM, PKW-Geschwindigkeit)",
        f"  Punkte  : {len(waypoints)} Wegpunkte (vereinfacht)",
        "─" * 55,
        "  START-KOORDINATEN",
        f"  lat={origin['lat']:.5f}, lng={origin['lon']:.5f}",
        "  ZIEL-KOORDINATEN",
        f"  lat={dest['lat']:.5f}, lng={dest['lon']:.5f}",
        "─" * 55,
        "  WAYPOINTS (für canvas_map_add_route → points):",
        waypoints_json,
        "═" * 55,
        "  HINWEIS: Fahrzeit gilt für PKW. Für Einsatzfahrzeuge",
        "  Sonderrechte (§35 StVO) einplanen: -20–30% Fahrzeit.",
        "═" * 55,
    ])


async def find_access_roads(
    location: str,
    radius_m: int = 300,
) -> str:
    """Finds driveable streets near an incident location and assesses fire truck accessibility.

    Returns a ranked list of nearby roads with:
    - Street name, highway classification
    - Fire truck accessibility rating
    - Road width and restrictions (if tagged in OSM)
    - Approach direction from incident

    AGENT: Use this to identify which streets vehicles can approach from.
    Then use get_route() to plan the actual approach route along the best street and
    place vehicle markers on the map with kind='firetruck', 'ladder', 'command',
    or 'ambulance' as appropriate.
    """
    try:
        geo = await _parse_location(location)
    except Exception as e:
        return f"Geocoding-Fehler: {e}"

    lat, lon = geo["lat"], geo["lon"]

    query = f"""
(
  way["highway"](around:{radius_m},{lat},{lon});
);
out body geom;
"""
    try:
        data = overpass_query(query)
    except Exception as e:
        return f"OSM-Fehler: {e}"

    elements = data.get("elements", [])
    if not elements:
        return f"Keine Straßen innerhalb {radius_m} m gefunden."

    # Deduplicate by name + highway
    seen: set[str] = set()
    roads: list[dict] = []
    for el in elements:
        if el.get("type") != "way":
            continue
        tags = el.get("tags", {})
        hw = tags.get("highway", "")
        if not hw or hw not in _FW_ACCESSIBLE:
            continue

        name = tags.get("name") or tags.get("ref") or "(unbenannte Straße)"
        key = f"{hw}::{name}"
        if key in seen:
            continue
        seen.add(key)

        # Find closest point on way geometry to incident
        geom = el.get("geometry", [])
        if geom:
            closest = min(geom, key=lambda p: _haversine(lat, lon, p["lat"], p["lon"]))
            dist = round(_haversine(lat, lon, closest["lat"], closest["lon"]))
            c_lat, c_lon = closest["lat"], closest["lon"]
        else:
            dist = radius_m
            c_lat, c_lon = lat, lon

        bearing = _bearing_label(lat, lon, c_lat, c_lon)

        roads.append({
            "name": name,
            "highway": hw,
            "dist_m": dist,
            "bearing": bearing,
            "width": tags.get("width") or tags.get("est_width"),
            "maxweight": tags.get("maxweight"),
            "maxheight": tags.get("maxheight"),
            "oneway": tags.get("oneway", "no"),
            "surface": tags.get("surface"),
            "access": _FW_ACCESSIBLE.get(hw, "unbekannt"),
            "lat": c_lat,
            "lon": c_lon,
        })

    roads.sort(key=lambda r: r["dist_m"])

    lines = [
        "═" * 60,
        "  ZUFAHRTSSTRASSEN-ANALYSE",
        "═" * 60,
        f"  Einsatzort : {geo['address'][:55]}",
        f"  GPS        : {lat:.5f}, {lon:.5f}",
        f"  Radius     : {radius_m} m  →  {len(roads)} Straßen gefunden",
        "─" * 60,
        f"  {'#':<3} {'Name':<28} {'Typ':<14} {'Dist':>5}  {'Ri'}  {'FW-Zufahrt'}",
        "─" * 60,
    ]
    for i, r in enumerate(roads[:12], 1):
        restrictions = []
        if r["width"]:
            restrictions.append(f"B:{r['width']}m")
        if r["maxweight"]:
            restrictions.append(f"max{r['maxweight']}t")
        if r["maxheight"]:
            restrictions.append(f"H:{r['maxheight']}m")
        if r["oneway"] not in ("no", "false", "0", None):
            restrictions.append("Einbahn")
        restr_str = " ".join(restrictions) if restrictions else ""
        name_short = r["name"][:26] if len(r["name"]) > 26 else r["name"]
        lines.append(
            f"  {i:<3} {name_short:<28} {r['highway']:<14} {r['dist_m']:>4}m  {r['bearing']:<2}  "
            f"{r['access'][:20]}{('  (' + restr_str + ')') if restr_str else ''}"
        )

    lines += [
        "─" * 60,
        "  LEGENDE Zufahrt:",
        "  'ja'              → uneingeschränkt nutzbar",
        "  'ja (Breite prüfen)' → ausreichend für HLF20 wenn ≥3.5m",
        "  'eingeschränkt'   → Sonderfall, Einsatzleiter entscheidet",
        "  'nein'            → nicht befahrbar",
        "═" * 60,
        "  NÄCHSTE SCHRITTE:",
        "  get_route(from, to_location) → Strecke mit Wegpunkten",
        "  → Wegpunkte mit canvas_map_add_route auf Karte zeichnen",
        "═" * 60,
    ]
    return "\n".join(lines)


async def find_staging_areas(
    location: str,
    radius_m: int = 500,
) -> str:
    """Finds suitable staging areas (Bereitstellungsräume) near an incident.

    Searches for: parking lots, squares, sports fields, industrial courtyards,
    wide road sections — anywhere vehicles can be positioned and managed.

    Returns candidates with coordinates and size estimate.

    AGENT: After finding candidates, place 'staging' markers on the map using
    canvas_map_add_marker with kind='staging'. Mark the best option with a label.
    """
    try:
        geo = await _parse_location(location)
    except Exception as e:
        return f"Geocoding-Fehler: {e}"

    lat, lon = geo["lat"], geo["lon"]

    query = f"""
(
  node["amenity"="parking"](around:{radius_m},{lat},{lon});
  way["amenity"="parking"](around:{radius_m},{lat},{lon});
  way["landuse"="parking"](around:{radius_m},{lat},{lon});
  way["leisure"="pitch"](around:{radius_m},{lat},{lon});
  way["leisure"="sports_centre"](around:{radius_m},{lat},{lon});
  way["landuse"="commercial"](around:{radius_m},{lat},{lon});
  way["landuse"="industrial"](around:{radius_m},{lat},{lon});
  node["highway"="bus_stop"](around:{radius_m},{lat},{lon});
  way["highway"="service"]["service"="parking_aisle"](around:{radius_m},{lat},{lon});
);
out center body;
"""
    try:
        data = overpass_query(query)
    except Exception as e:
        return f"OSM-Fehler: {e}"

    elements = data.get("elements", [])

    candidates: list[dict] = []
    for el in elements:
        tags = el.get("tags", {})
        # Get center coordinates
        if el.get("type") == "node":
            c_lat, c_lon = el.get("lat", lat), el.get("lon", lon)
        elif "center" in el:
            c_lat, c_lon = el["center"]["lat"], el["center"]["lon"]
        else:
            continue

        dist = round(_haversine(lat, lon, c_lat, c_lon))
        bearing = _bearing_label(lat, lon, c_lat, c_lon)

        amenity = tags.get("amenity", "")
        landuse = tags.get("landuse", "")
        leisure = tags.get("leisure", "")
        hw = tags.get("highway", "")
        name = tags.get("name") or tags.get("ref") or ""
        capacity = tags.get("capacity")
        capacity_num = _parse_capacity(capacity)

        if amenity == "parking":
            kind = "Parkplatz"
            suitability = "gut" if capacity_num is None or capacity_num >= 10 else "klein"
        elif landuse == "parking":
            kind = "Parkfläche (Gelände)"
            suitability = "gut"
        elif leisure == "pitch":
            kind = "Sportplatz/Spielfeld"
            suitability = "bedingt (Untergrund prüfen)"
        elif leisure == "sports_centre":
            kind = "Sportzentrum-Parkplatz"
            suitability = "gut"
        elif landuse in ("commercial", "industrial"):
            kind = f"Gewerbefläche ({landuse})"
            suitability = "gut (oft großzügig)"
        elif hw == "bus_stop":
            kind = "Buswendeplatz/Haltestelle"
            suitability = "bedingt"
        else:
            kind = "Sonstige Fläche"
            suitability = "prüfen"

        candidates.append({
            "kind": kind,
            "name": name,
            "dist_m": dist,
            "bearing": bearing,
            "suitability": suitability,
            "lat": round(c_lat, 6),
            "lon": round(c_lon, 6),
            "capacity": capacity,
            "access": tags.get("access", ""),
        })

    candidates.sort(key=lambda c: c["dist_m"])

    if not candidates:
        return (
            f"Keine geeigneten Bereitstellungsräume in {radius_m} m gefunden.\n"
            f"→ Radius erhöhen oder manuell geeignete Fläche auf Karte markieren."
        )

    lines = [
        "═" * 60,
        "  BEREITSTELLUNGSRÄUME",
        "═" * 60,
        f"  Einsatzort : {geo['address'][:55]}",
        f"  GPS        : {lat:.5f}, {lon:.5f}",
        f"  Radius     : {radius_m} m  →  {len(candidates)} Flächen gefunden",
        "─" * 60,
    ]
    for i, c in enumerate(candidates[:8], 1):
        name_str = f" – {c['name']}" if c["name"] else ""
        cap_str = f"  Kapazität: {c['capacity']} Fahrzeuge" if c["capacity"] else ""
        access_str = f"  Zugang: {c['access']}" if c["access"] and c["access"] != "yes" else ""
        lines += [
            f"  {i}. {c['kind']}{name_str}",
            f"     Entfernung : {c['dist_m']} m {c['bearing']}",
            f"     Eignung    : {c['suitability']}",
            f"     GPS        : lat={c['lat']}, lng={c['lon']}",
        ]
        if cap_str:
            lines.append(f"     {cap_str.strip()}")
        if access_str:
            lines.append(f"     {access_str.strip()}")
        lines.append("")

    lines += [
        "─" * 60,
        "  NÄCHSTE SCHRITTE:",
        "  canvas_map_add_marker(kind='staging', lat=..., lng=...) → Bereitstellungsraum markieren",
        "  get_route(from='Bereitstellungsraum', to='Einsatzort') → Zufahrt berechnen",
        "  canvas_map_add_route(points=...) → Zufahrt auf Karte zeichnen",
        "═" * 60,
    ]
    return "\n".join(lines)


async def get_road_info(
    location: str,
    radius_m: int = 50,
) -> str:
    """Returns detailed road properties (width, restrictions, surface) near a location.

    Useful for checking whether a specific road is passable for heavy fire apparatus
    (HLF20: 3.0m wide, 14.5t; DLK: 3.0m wide, 16t; TLF4000: 3.0m wide, 18t).

    location: address or 'lat,lon'
    radius_m: search radius (keep small, 30–80 m, for precise road lookup)

    AGENT: Use to verify that a planned access route is actually passable for the vehicles.
    Place heavy vehicles on the canvas only after this check is plausible.
    """
    try:
        geo = await _parse_location(location)
    except Exception as e:
        return f"Geocoding-Fehler: {e}"

    lat, lon = geo["lat"], geo["lon"]

    query = f"""
way["highway"](around:{radius_m},{lat},{lon});
out body;
"""
    try:
        data = overpass_query(query)
    except Exception as e:
        return f"OSM-Fehler: {e}"

    elements = [el for el in data.get("elements", []) if el.get("type") == "way"]
    if not elements:
        return f"Keine Straße in {radius_m} m Radius gefunden. Radius vergrößern oder Koordinaten prüfen."

    lines = [
        "═" * 55,
        "  STRAßENINFORMATIONEN",
        "═" * 55,
        f"  Position : {geo['address'][:52]}",
        f"  GPS      : {lat:.5f}, {lon:.5f}",
        f"  Radius   : {radius_m} m  →  {len(elements)} Weg(e) gefunden",
    ]

    for el in elements[:5]:
        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("ref") or "(unbenannt)"
        hw = tags.get("highway", "unbekannt")
        lines += [
            "─" * 55,
            f"  Straße   : {name}",
            f"  Typ      : {hw}",
            f"  FW-Zufahrt: {_FW_ACCESSIBLE.get(hw, 'unbekannt')}",
        ]

        props = [
            ("Breite", tags.get("width") or tags.get("est_width")),
            ("Oberfläche", tags.get("surface")),
            ("Max. Gewicht", tags.get("maxweight")),
            ("Max. Höhe", tags.get("maxheight")),
            ("Max. Breite", tags.get("maxwidth")),
            ("Einbahnstr.", tags.get("oneway")),
            ("Zugang", tags.get("access")),
            ("Beleuchtung", tags.get("lit")),
        ]
        for label, val in props:
            if val and val not in ("no", "false"):
                lines.append(f"  {label:<14}: {val}")

        # Accessibility verdict for standard fire vehicles
        w_raw = tags.get("width") or tags.get("est_width")
        mw_raw = tags.get("maxweight")
        try:
            w = float(str(w_raw).replace("m", "").strip()) if w_raw else None
        except ValueError:
            w = None
        try:
            mw = float(str(mw_raw).replace("t", "").strip()) if mw_raw else None
        except ValueError:
            mw = None

        verdicts = []
        if w is not None:
            if w >= 3.5:
                verdicts.append(f"Breite {w}m: ✓ alle Fahrzeuge")
            elif w >= 3.0:
                verdicts.append(f"Breite {w}m: ✓ HLF/TLF, ✗ breite Sonderfahrzeuge")
            else:
                verdicts.append(f"Breite {w}m: ✗ zu schmal (mind. 3.0m für Einsatzfahrzeuge)")
        if mw is not None:
            if mw >= 18:
                verdicts.append(f"Gewicht {mw}t: ✓ alle Fahrzeuge")
            elif mw >= 14:
                verdicts.append(f"Gewicht {mw}t: ✓ HLF20/TLF3000, ✗ TLF4000/GTLF")
            else:
                verdicts.append(f"Gewicht {mw}t: ✗ zu gering (HLF20 ≈14.5t)")

        if verdicts:
            lines.append("─" * 55)
            lines.append("  FAHRZEUG-CHECK:")
            for v in verdicts:
                lines.append(f"  {v}")

    lines += [
        "─" * 55,
        "  OSM-Daten können unvollständig sein.",
        "  Fehlende Breitenangabe ≠ unbefahrbar — vor Ort prüfen.",
        "═" * 55,
    ]
    return "\n".join(lines)


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        get_route,
        name="get_route",
        description=(
            "Plans a driving route between two locations using OSRM and returns full geometry "
            "(waypoints array) for plotting on the canvas map via canvas_map_add_route. "
            "Accepts address strings or 'lat,lon' coordinates. "
            "Returns distance, drive time, and a JSON waypoints array ready for canvas_map_add_route. "
            "Use staging/fire/firetruck/ladder/command markers to visualize the route tactically."
        ),
    )
    mcp.add_tool(
        find_access_roads,
        name="find_access_roads",
        description=(
            "Finds driveable streets near an incident and rates fire truck accessibility. "
            "Returns road names, highway type, width, weight/height restrictions, and approach direction. "
            "Use to identify which streets vehicles can approach from, then plan routes with get_route() "
            "and place firetruck/ladder/command/ambulance markers on the selected streets."
        ),
    )
    mcp.add_tool(
        find_staging_areas,
        name="find_staging_areas",
        description=(
            "Finds suitable staging areas (Bereitstellungsräume) near an incident: "
            "parking lots, squares, sports fields, industrial yards. "
            "Returns candidates with GPS coordinates and suitability rating. "
            "Use canvas_map_add_marker with kind='staging' to mark the chosen area."
        ),
    )
    mcp.add_tool(
        get_road_info,
        name="get_road_info",
        description=(
            "Returns detailed road properties near a location: name, highway type, "
            "width, max weight, max height, surface, oneway restrictions. "
            "Includes a vehicle accessibility check for standard fire apparatus (HLF20, TLF, DLK). "
            "Use a small radius (30–80 m) for precise road lookup."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        print(await get_route("Marienplatz 1, München", "Hauptbahnhof München"))
        print()
        print(await find_access_roads("Marienplatz 1, München", radius_m=200))
        print()
        print(await find_staging_areas("Marienplatz 1, München", radius_m=400))
        print()
        print(await get_road_info("Kaufingerstraße, München", radius_m=50))

    asyncio.run(main())
