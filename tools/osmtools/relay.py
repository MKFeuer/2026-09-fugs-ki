import math
import httpx
from datetime import datetime
from mcp.server.fastmcp import FastMCP

OSRM_URL = "http://router.project-osrm.org/route/v1/driving"

# Pressure loss constants per German fire service tables (simplified)
# B-hose (75 mm DN): 0.01 bar/m at 800 l/min, scales with Q²
# A-hose (110 mm DN): 0.002 bar/m at 800 l/min (1/5 of B)
_PRESSURE_LOSS_PER_M = {"B": 0.010, "A": 0.002}

_PUMP_OUTPUT_BAR   = 10.0   # standard FPN 10-1000 / 10-2000
_DELIVERY_PRESSURE = 2.0    # minimum pressure at relay inlet / incident


async def _route(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    """Returns (drive_time_min, road_distance_m) via OSRM. Falls back to straight-line × 1.4."""
    try:
        url = f"{OSRM_URL}/{lon1},{lat1};{lon2},{lat2}?overview=false"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            route = r.json()["routes"][0]
            return route["duration"] / 60, route["distance"]
    except Exception:
        import math as _m
        R = 6_371_000
        p1, p2 = _m.radians(lat1), _m.radians(lat2)
        dp, dl = _m.radians(lat2 - lat1), _m.radians(lon2 - lon1)
        a = _m.sin(dp / 2) ** 2 + _m.cos(p1) * _m.cos(p2) * _m.sin(dl / 2) ** 2
        straight = 2 * R * _m.asin(_m.sqrt(a))
        return (straight * 1.4) / 1000 / 40 * 60, straight * 1.4  # 40 km/h fallback


def _max_section_length(flow_l_min: int, hose_type: str) -> float:
    """Maximum hose length per pump stage in meters."""
    r = _PRESSURE_LOSS_PER_M.get(hose_type.upper(), _PRESSURE_LOSS_PER_M["B"])
    available = _PUMP_OUTPUT_BAR - _DELIVERY_PRESSURE
    # pressure loss scales with Q²
    r_at_flow = r * (flow_l_min / 800) ** 2
    if r_at_flow == 0:
        return float("inf")
    return available / r_at_flow


def _relay_stations(distance_m: float, flow_l_min: int, hose_type: str) -> int:
    max_l = _max_section_length(flow_l_min, hose_type)
    sections = math.ceil(distance_m / max_l)
    return max(0, sections - 1)


def _parallel_lines(flow_l_min: int) -> int:
    """Number of parallel B-hose lines needed for given flow."""
    return math.ceil(flow_l_min / 800)


async def plan_relay_pumping(
    flow_l_min: int,
    distance_m: int = 0,
    incident_lat: float | None = None,
    incident_lon: float | None = None,
    water_lat: float | None = None,
    water_lon: float | None = None,
    hose_type: str = "B",
) -> str:
    """Plans a relay pumping chain for long-distance water supply.

    Calculates number of relay pumps, their positions, hose requirements
    and pressure analysis. Best used for distances > 800 m where shuttle
    traffic is impractical or insufficient.

    AGENT: Use when distance to water source exceeds ~800 m and shuttle
    requires too many vehicles. Provide GPS coordinates for routing-based
    distance, or distance_m for manual input.
    hose_type: "B" (75 mm, default) or "A" (110 mm, higher flow capacity).
    """
    hose_type = hose_type.upper()
    if hose_type not in ("A", "B"):
        return "hose_type must be 'A' or 'B'."

    routed = False
    road_m = float(distance_m)
    drive_min = 0.0

    if all(v is not None for v in (incident_lat, incident_lon, water_lat, water_lon)):
        drive_min, road_m = await _route(incident_lat, incident_lon, water_lat, water_lon)
        routed = True
    elif distance_m == 0:
        return "Provide either GPS coordinates (incident + water) or distance_m."

    lines_needed = _parallel_lines(flow_l_min)
    max_section = _max_section_length(flow_l_min, hose_type)
    relay_count = _relay_stations(road_m, flow_l_min, hose_type)
    total_hoses_per_line = math.ceil(road_m / 20)
    total_hoses = total_hoses_per_line * lines_needed

    # Position relay pumps evenly along the route
    section_len = road_m / (relay_count + 1) if relay_count > 0 else road_m
    relay_positions = [round(section_len * i) for i in range(1, relay_count + 1)]

    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")
    route_src = f"OSRM road network" if routed else "manual input"

    lines = [
        "═" * 55,
        f"  RELAY PUMPING PLAN  •  {ts}",
        "═" * 55,
        f"  Flow required     : {flow_l_min} l/min",
        f"  Total distance    : {round(road_m)} m  ({route_src})",
        f"  Hose type         : {hose_type}-hose ({75 if hose_type == 'B' else 110} mm DN)",
        f"  Max section length: {round(max_section)} m per pump stage",
        "",
        "─" * 55,
        "  RELAY CHAIN",
        f"  Pump stages       : {relay_count + 1}",
        f"  Relay pumps needed: {relay_count}  (+ 1 source pump)",
        f"  Total pump vehicles: {relay_count + 1}",
    ]

    if relay_count == 0:
        lines.append("  → Direct lay, no relay pumps required.")
    else:
        lines.append("")
        lines.append("  Relay positions (distance from water source):")
        for i, pos in enumerate(relay_positions, 1):
            lines.append(f"    Relay {i}: at {pos} m")

    lines += [
        "",
        "─" * 55,
        "  HOSE REQUIREMENTS",
        f"  Parallel lines    : {lines_needed}×  (for {flow_l_min} l/min)",
        f"  Hoses per line    : {total_hoses_per_line}× {hose_type}-hose (20 m)",
        f"  Total hoses       : {total_hoses}× {hose_type}-hose",
        "",
        "─" * 55,
        "  PRESSURE ANALYSIS",
        f"  Pump output       : {_PUMP_OUTPUT_BAR} bar",
        f"  Delivery pressure : {_DELIVERY_PRESSURE} bar (minimum)",
        f"  Available per stage: {_PUMP_OUTPUT_BAR - _DELIVERY_PRESSURE} bar",
        f"  Loss per 100 m    : {_PRESSURE_LOSS_PER_M[hose_type] * (flow_l_min / 800)**2 * 100:.2f} bar  (at {flow_l_min} l/min)",
    ]

    if lines_needed > 1:
        lines += [
            "",
            f"  NOTE: {flow_l_min} l/min exceeds single-line capacity (800 l/min).",
            f"  Lay {lines_needed} parallel lines or use A-hose (110 mm) to reduce line count.",
        ]

    if drive_min > 0:
        lines += [
            "",
            f"  Drive time to water source: {drive_min:.1f} min (OSRM)",
        ]

    lines.append("═" * 55)
    return "\n".join(lines)


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        plan_relay_pumping,
        name="plan_relay_pumping",
        description=(
            "Plans a relay pumping chain for long-distance water supply. "
            "Calculates number of relay pump vehicles, positions, total hose count "
            "and pressure analysis. Use for distances > 800 m where shuttle is impractical. "
            "Provide GPS coordinates for routing-based distance (recommended), or distance_m manually. "
            "hose_type: 'B' (default, 75 mm) or 'A' (110 mm, higher flow capacity)."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        print(await plan_relay_pumping(flow_l_min=800, distance_m=2500))
        print()
        print(await plan_relay_pumping(flow_l_min=1600, distance_m=1200, hose_type="A"))

    asyncio.run(main())
