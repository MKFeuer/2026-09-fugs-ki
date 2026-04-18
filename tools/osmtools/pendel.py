import math
import httpx
from datetime import datetime
from mcp.server.fastmcp import FastMCP

OSRM_URL = "http://router.project-osrm.org/route/v1/driving"

# DIN 14530 / Bavarian standard vehicles
VEHICLES: dict[str, dict] = {
    "LF 10":    {"tank_l": 1_000,  "pump_l_min": 1_000},
    "LF 20":    {"tank_l": 1_000,  "pump_l_min": 2_000},
    "HLF 10":   {"tank_l": 1_000,  "pump_l_min": 1_000},
    "HLF 20":   {"tank_l": 2_000,  "pump_l_min": 2_000},
    "TLF 3000": {"tank_l": 3_000,  "pump_l_min": 1_000},
    "TLF 4000": {"tank_l": 4_000,  "pump_l_min": 1_000},
    "TLF 5000": {"tank_l": 5_000,  "pump_l_min": 1_600},
    "GTLF":     {"tank_l": 12_000, "pump_l_min": 2_000},
    "SW 2000":  {"tank_l": 0,      "pump_l_min": 0},
}

_HOSE_LAY_LIMIT_M = 500
_SHUTTLE_LIMIT_M  = 1_000
_SETUP_MIN        = 2


async def _route(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    """Returns (drive_time_min, road_distance_m) via OSRM. Falls back to straight-line × 1.4 at 40 km/h."""
    try:
        url = f"{OSRM_URL}/{lon1},{lat1};{lon2},{lat2}?overview=false"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            route = r.json()["routes"][0]
            return route["duration"] / 60, route["distance"]
    except Exception:
        R = 6_371_000
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        straight = 2 * R * math.asin(math.sqrt(a))
        return (straight * 1.4) / 1_000 / 40 * 60, straight * 1.4


def _cycle_time(drive_min: float, tank_l: int, pump_l_min: int, fill_min: int) -> float:
    t_discharge = tank_l / pump_l_min if pump_l_min > 0 else 0
    return 2 * drive_min + fill_min + t_discharge + _SETUP_MIN


def _delivery_rate(tank_l: int, cycle_min: float) -> float:
    return tank_l / cycle_min if cycle_min > 0 else 0


def _vehicles_required(demand_l_min: int, tank_l: int, cycle_min: float) -> int:
    if tank_l == 0 or cycle_min == 0:
        return 0
    return max(math.ceil((demand_l_min * cycle_min) / tank_l), 2)


def _recommendation(distance_m: float, n_required: int) -> str:
    if distance_m <= _HOSE_LAY_LIMIT_M:
        return "HOSE LAY recommended — short distance, low effort."
    if distance_m >= _SHUTTLE_LIMIT_M:
        return f"WATER SHUTTLE recommended — distance {round(distance_m)} m exceeds hose lay limit."
    if n_required <= 3:
        return f"WATER SHUTTLE feasible — {n_required} vehicles needed, borderline distance."
    return "HOSE LAY preferred — too many vehicles required for shuttle."


def _hose_assessment(road_m: float, demand_l_min: int) -> dict:
    hoses = math.ceil(road_m / 20)
    relay_pumps = max(0, math.ceil(road_m / 400) - 1)
    lines = math.ceil(demand_l_min / 800)
    setup_min = math.ceil(hoses * lines * 0.5)
    return {
        "road_m": round(road_m),
        "hoses": hoses * lines,
        "lines": lines,
        "relay_pumps": relay_pumps * lines,
        "setup_min": setup_min,
    }


async def plane_pendelverkehr(
    wasserbedarf_l_min: int,
    fahrzeugtyp: str = "TLF 3000",
    entfernung_m: int = 0,
    incident_lat: float | None = None,
    incident_lon: float | None = None,
    water_lat: float | None = None,
    water_lon: float | None = None,
    anzahl_fahrzeuge: int | None = None,
    befuellzeit_min: int = 4,
) -> str:
    """Plans a single-type water shuttle operation.

    Calculates cycle time, delivery rate, and required vehicles.
    Compares against hose lay and gives a tactical recommendation.

    AGENT:
    - Provide GPS coordinates (incident + water source) for OSRM-based routing (recommended).
      GPS comes from geocode_location() + analyze_hydrants() or find_open_water().
    - Or provide entfernung_m for manual distance input (falls back to 40 km/h estimate).
    - Use list_vehicle_types() to see available types.
    - Shuttle pays off at distances > 800-1000 m. Below that, prefer hose lay.
    - For mixed vehicle fleets use plan_mixed_fleet_shuttle() instead.
    """
    typ = fahrzeugtyp.upper().replace("-", " ").strip()
    vinfo = next((v for k, v in VEHICLES.items() if k.upper() == typ), None)
    if vinfo is None:
        return f"Unknown vehicle type '{fahrzeugtyp}'. Available: {', '.join(VEHICLES.keys())}"
    if vinfo["tank_l"] == 0:
        return f"{fahrzeugtyp} has no water tank — not suitable for shuttle."

    routed = False
    road_m = float(entfernung_m)
    drive_min_one_way = 0.0

    if incident_lat is not None and incident_lon is not None and water_lat is not None and water_lon is not None:
        drive_min_one_way, road_m = await _route(incident_lat, incident_lon, water_lat, water_lon)
        routed = True
    elif entfernung_m == 0:
        return "Provide GPS coordinates (incident + water) or entfernung_m."
    else:
        drive_min_one_way = (road_m / 1_000) / 40 * 60  # 40 km/h estimate

    cycle = _cycle_time(drive_min_one_way, vinfo["tank_l"], vinfo["pump_l_min"], befuellzeit_min)
    rate = _delivery_rate(vinfo["tank_l"], cycle)
    n_min = _vehicles_required(wasserbedarf_l_min, vinfo["tank_l"], cycle)
    n = anzahl_fahrzeuge if anzahl_fahrzeuge is not None else n_min
    hl = _hose_assessment(road_m, wasserbedarf_l_min)
    rec = _recommendation(road_m, n_min)
    vtype_clean = next(k for k in VEHICLES if k.upper() == typ)
    route_src = "OSRM road network" if routed else "manual input, est. 40 km/h"

    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")
    lines = [
        "═" * 55,
        f"  WATER SHUTTLE PLAN  •  {ts}",
        "═" * 55,
        f"  Water demand         : {wasserbedarf_l_min} l/min",
        f"  Route distance       : {round(road_m)} m  ({route_src})",
        f"  Vehicle type         : {vtype_clean}",
        f"  Tank / pump          : {vinfo['tank_l']:,} L / {vinfo['pump_l_min']:,} l/min",
        "",
        "─" * 55,
        "  TIMING (per vehicle)",
        f"  Drive one way  : {drive_min_one_way:.1f} min",
        f"  Fill time      : {befuellzeit_min} min",
        f"  Discharge time : {vinfo['tank_l'] / vinfo['pump_l_min']:.1f} min",
        f"  Setup          : {_SETUP_MIN} min",
        f"  ─────────────────────────",
        f"  Cycle time     : {cycle:.1f} min",
        f"  Delivery / veh : {rate:.0f} l/min",
        "",
        "─" * 55,
        "  SHUTTLE PLAN",
        f"  Vehicles       : {n}× {vtype_clean}",
        f"  Total delivery : {rate * n:.0f} l/min  (demand: {wasserbedarf_l_min} l/min)",
        f"  Reserve        : {(rate * n) - wasserbedarf_l_min:.0f} l/min",
        "",
        "  Dispatch schedule:",
    ]
    for i in range(1, n + 1):
        offset = (i - 1) * (cycle / n)
        lines.append(
            f"    Vehicle {i}: depart t+{offset:.0f} min  →  on scene ~t+{offset + drive_min_one_way:.0f} min"
        )

    lines += [
        "",
        "─" * 55,
        "  ALTERNATIVE: HOSE LAY",
        f"  Road distance  : {hl['road_m']} m",
        f"  B-hoses        : {hl['hoses']}× (20 m)  ×{hl['lines']} line(s)",
        f"  Relay pumps    : {hl['relay_pumps']}×",
        f"  Setup time     : {hl['setup_min']} min (est.)",
        "",
        "─" * 55,
        f"  RECOMMENDATION: {rec}",
        "═" * 55,
        "  NOTE: Shuttle and hose lay can run in parallel.",
        "═" * 55,
    ]
    return "\n".join(lines)


async def plan_mixed_fleet_shuttle(
    demand_l_min: int,
    fleet: dict,
    entfernung_m: int = 0,
    incident_lat: float | None = None,
    incident_lon: float | None = None,
    water_lat: float | None = None,
    water_lon: float | None = None,
    fill_min: int = 4,
) -> str:
    """Plans a water shuttle with a mixed vehicle fleet.

    fleet format: {"TLF 3000": 2, "HLF 20": 1, "TLF 5000": 1}
    Calculates individual cycle times per vehicle type and aggregates total delivery rate.
    Provides a staggered dispatch schedule to avoid simultaneous arrivals at the water source.

    AGENT: Use when you have vehicles of different types available.
    Provide GPS coordinates for OSRM routing, or entfernung_m for manual distance.
    """
    routed = False
    road_m = float(entfernung_m)
    drive_min = 0.0

    if incident_lat is not None and incident_lon is not None and water_lat is not None and water_lon is not None:
        drive_min, road_m = await _route(incident_lat, incident_lon, water_lat, water_lon)
        routed = True
    elif entfernung_m == 0:
        return "Provide GPS coordinates (incident + water) or entfernung_m."
    else:
        drive_min = (road_m / 1_000) / 40 * 60

    route_src = "OSRM road network" if routed else "manual, est. 40 km/h"

    # Validate fleet and compute per-type stats
    fleet_stats = []
    errors = []
    for vtype_raw, count in fleet.items():
        typ = vtype_raw.upper().replace("-", " ").strip()
        vinfo = next((v for k, v in VEHICLES.items() if k.upper() == typ), None)
        if vinfo is None:
            errors.append(f"Unknown type '{vtype_raw}'")
            continue
        if vinfo["tank_l"] == 0:
            errors.append(f"'{vtype_raw}' has no tank, skipped")
            continue
        vtype_clean = next(k for k in VEHICLES if k.upper() == typ)
        cycle = _cycle_time(drive_min, vinfo["tank_l"], vinfo["pump_l_min"], fill_min)
        rate = _delivery_rate(vinfo["tank_l"], cycle)
        fleet_stats.append({
            "type": vtype_clean,
            "count": int(count),
            "tank_l": vinfo["tank_l"],
            "pump_l_min": vinfo["pump_l_min"],
            "cycle_min": cycle,
            "rate_per_vehicle": rate,
            "total_rate": rate * int(count),
        })

    if not fleet_stats:
        return "No valid vehicles in fleet. " + "; ".join(errors)

    total_rate = sum(f["total_rate"] for f in fleet_stats)
    total_vehicles = sum(f["count"] for f in fleet_stats)
    reserve = total_rate - demand_l_min
    rec = _recommendation(road_m, total_vehicles)

    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")
    lines = [
        "═" * 55,
        f"  MIXED FLEET SHUTTLE PLAN  •  {ts}",
        "═" * 55,
        f"  Water demand    : {demand_l_min} l/min",
        f"  Route distance  : {round(road_m)} m  ({route_src})",
        f"  Drive one way   : {drive_min:.1f} min",
        f"  Fill time       : {fill_min} min",
        "",
        "─" * 55,
        "  FLEET BREAKDOWN",
        f"  {'Type':<12} {'Count':>5}  {'Tank L':>7}  {'Cycle':>7}  {'Rate/veh':>9}  {'Total':>7}",
        "─" * 55,
    ]
    for f in fleet_stats:
        lines.append(
            f"  {f['type']:<12} {f['count']:>5}  {f['tank_l']:>7,}  "
            f"{f['cycle_min']:>6.1f}m  {f['rate_per_vehicle']:>8.0f}  {f['total_rate']:>6.0f}"
        )
    lines += [
        "─" * 55,
        f"  {'TOTAL':<12} {total_vehicles:>5}  {'':>7}  {'':>7}  {'':>9}  {total_rate:>6.0f}",
        "",
        "─" * 55,
        f"  SUMMARY",
        f"  Total delivery  : {total_rate:.0f} l/min  (demand: {demand_l_min} l/min)",
        f"  Reserve         : {reserve:.0f} l/min {'✓' if reserve >= 0 else '✗ INSUFFICIENT'}",
    ]

    if reserve < 0:
        lines.append(f"  WARNING: Fleet {abs(reserve):.0f} l/min short — add vehicles or reduce demand.")

    # Dispatch schedule: sort all individual vehicles by cycle time, stagger evenly
    all_vehicles = []
    for f in fleet_stats:
        for j in range(f["count"]):
            all_vehicles.append({"type": f["type"], "cycle": f["cycle_min"]})
    all_vehicles.sort(key=lambda v: v["cycle"])

    lines += ["", "  Dispatch schedule (all depart immediately — stagger fill slots):"]
    avg_cycle = sum(v["cycle"] for v in all_vehicles) / len(all_vehicles)
    for i, v in enumerate(all_vehicles):
        fill_offset = i * (avg_cycle / len(all_vehicles))
        lines.append(
            f"    Vehicle {i+1} ({v['type']}): on scene ~t+{drive_min:.0f} min  |  "
            f"fill slot offset: +{fill_offset:.0f} min"
        )

    lines += [
        "",
        "─" * 55,
        f"  RECOMMENDATION: {rec}",
        "═" * 55,
    ]
    if errors:
        lines.append("  Warnings: " + "; ".join(errors))
        lines.append("═" * 55)
    return "\n".join(lines)


async def fahrzeugtypen_liste() -> str:
    """Lists all known fire apparatus types with tank capacity and pump output."""
    lines = [
        "═" * 55,
        "  VEHICLE TYPES — Water Tank & Pump Output",
        "═" * 55,
        f"  {'Type':<12} {'Tank [L]':>10}  {'Pump [l/min]':>13}",
        "─" * 55,
    ]
    for vtype, d in VEHICLES.items():
        tank = f"{d['tank_l']:,}" if d["tank_l"] > 0 else "—"
        pump = f"{d['pump_l_min']:,}" if d["pump_l_min"] > 0 else "—"
        lines.append(f"  {vtype:<12} {tank:>10}  {pump:>13}")
    lines += [
        "─" * 55,
        "  Source: DIN 14530 / Bavarian standard",
        "═" * 55,
    ]
    return "\n".join(lines)


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        plane_pendelverkehr,
        name="plan_water_shuttle",
        description=(
            "Plans a single-type water shuttle operation. Calculates cycle time, delivery rate "
            "and required vehicles. Compares against hose lay. "
            "Provide GPS coordinates for OSRM routing (recommended) or entfernung_m for manual input. "
            "For mixed vehicle fleets use plan_mixed_fleet_shuttle()."
        ),
    )
    mcp.add_tool(
        plan_mixed_fleet_shuttle,
        name="plan_mixed_fleet_shuttle",
        description=(
            "Plans a water shuttle with a mixed vehicle fleet. "
            "fleet format: {\"TLF 3000\": 2, \"HLF 20\": 1}. "
            "Calculates per-type cycle times, total delivery rate, and staggered dispatch schedule. "
            "Provide GPS coordinates for OSRM routing or entfernung_m for manual distance."
        ),
    )
    mcp.add_tool(
        fahrzeugtypen_liste,
        name="list_vehicle_types",
        description=(
            "Lists all known German fire apparatus types with water tank capacity and pump output. "
            "Use to select vehicle types for plan_water_shuttle() or plan_mixed_fleet_shuttle()."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        print(await fahrzeugtypen_liste())
        print()
        print(await plane_pendelverkehr(
            wasserbedarf_l_min=800,
            fahrzeugtyp="TLF 3000",
            incident_lat=48.1375, incident_lon=11.5747,
            water_lat=48.1500, water_lon=11.5600,
        ))
        print()
        print(await plan_mixed_fleet_shuttle(
            demand_l_min=1600,
            fleet={"TLF 3000": 2, "TLF 5000": 1, "HLF 20": 2},
            entfernung_m=1500,
        ))

    asyncio.run(main())
