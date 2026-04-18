import math
from datetime import datetime
from mcp.server.fastmcp import FastMCP

from osmtools.hydrant import _geocode, _find_hydrants
from osmtools.openwater import _find_open_water
from osmtools.demand import BUILDING_DEMAND, FIRE_STAGES
from osmtools.pendel import _route, VEHICLES, _cycle_time, _delivery_rate, _vehicles_required, _recommendation
from osmtools.relay import _relay_stations, _parallel_lines, _max_section_length


def _demand_value(building_type: str, fire_stage: str) -> int:
    info = BUILDING_DEMAND.get(building_type)
    if not info:
        return 800  # safe default
    return info.get(fire_stage, info["developing"])


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def water_supply_overview(
    location: str,
    building_type: str = "residential_large",
    fire_stage: str = "developing",
    radius_m: int = 500,
    vehicle_type: str = "TLF 3000",
) -> str:
    """Generates a comprehensive water supply overview for an incident.

    Combines: demand estimation, hydrant search, open water search,
    shuttle and relay assessment — all in one report.

    AGENT: Call this as the primary water management tool at the start of an incident.
    It will tell you everything about water supply in one report.
    Then use the specific tools (plan_water_shuttle, plan_relay_pumping, etc.) for details.

    building_type: residential_small, residential_large, commercial, retail,
    industrial_light, industrial_heavy, warehouse, agricultural, highrise, hospital, school, vehicle, forest.
    fire_stage: incipient, developing, fully_developed.
    """
    # 1. Geocode
    geo = await _geocode(location)
    lat, lon = geo["lat"], geo["lon"]

    # 2. Demand
    if building_type not in BUILDING_DEMAND:
        building_type = "residential_large"
    if fire_stage not in FIRE_STAGES:
        fire_stage = "developing"
    demand = _demand_value(building_type, fire_stage)
    binfo = BUILDING_DEMAND[building_type]

    # 3. Find hydrants
    hydrants = await _find_hydrants(lat, lon, radius_m)

    # 4. Find open water
    open_water = await _find_open_water(lat, lon, radius_m * 2)

    # 5. Routing to best hydrant (if any)
    best_hydrant = hydrants[0] if hydrants else None
    drive_min = 0.0
    road_m = 0.0
    if best_hydrant:
        drive_min, road_m = await _route(lat, lon, best_hydrant["lat"], best_hydrant["lon"])

    # 6. Shuttle assessment
    vinfo = VEHICLES.get(vehicle_type)
    shuttle_n = None
    shuttle_rate = None
    if best_hydrant and vinfo and vinfo["tank_l"] > 0:
        cycle = _cycle_time(drive_min, vinfo["tank_l"], vinfo["pump_l_min"], 4)
        shuttle_rate = _delivery_rate(vinfo["tank_l"], cycle)
        shuttle_n = _vehicles_required(demand, vinfo["tank_l"], cycle)

    # 7. Relay assessment
    relay_n = 0
    if road_m > 0:
        relay_n = _relay_stations(road_m, demand, "B")

    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")

    lines = [
        "═" * 55,
        f"  WATER SUPPLY OVERVIEW  •  {ts}",
        "═" * 55,
        f"  Incident  : {geo['address'][:50]}",
        f"  GPS       : {lat:.5f}° N / {lon:.5f}° E",
        "",
        "─" * 55,
        "  1. WATER DEMAND ESTIMATE",
        f"  Building type : {binfo['label']}",
        f"  Fire stage    : {fire_stage.replace('_', ' ').title()}",
        f"  DEMAND        : {demand} l/min",
        "",
        "─" * 55,
        "  2. NEAREST HYDRANT",
    ]

    if best_hydrant:
        lines += [
            f"  Type       : {best_hydrant['label']}",
            f"  Distance   : {best_hydrant['distance_m']} m  (straight line)",
            f"  Road route : {round(road_m)} m  |  Drive time: {drive_min:.1f} min  (OSRM)",
            f"  Flow rate  : {best_hydrant['flow']} l/min{'  (estimated)' if best_hydrant['estimated'] else ''}",
            f"  GPS        : {best_hydrant['lat']:.5f}, {best_hydrant['lon']:.5f}",
            f"  OSM        : https://www.openstreetmap.org/node/{best_hydrant['id']}",
            f"  Total hydrants in {radius_m} m: {len(hydrants)}",
        ]
    else:
        lines += [
            f"  NO hydrants found within {radius_m} m.",
            "  → Run analyze_hydrants() with larger radius.",
        ]

    lines += ["", "─" * 55, "  3. NEAREST OPEN WATER SOURCE"]
    if open_water:
        ow = open_water[0]
        name_str = f" ({ow['name']})" if ow["name"] else ""
        lines += [
            f"  Type     : {ow['label']}{name_str}",
            f"  Distance : {ow['distance_m']} m",
            f"  GPS      : {ow['lat']:.5f}, {ow['lon']:.5f}",
            f"  Total open water in {radius_m * 2} m: {len(open_water)}",
        ]
    else:
        lines += [f"  None found within {radius_m * 2} m."]

    lines += ["", "─" * 55, "  4. SUPPLY STRATEGY ASSESSMENT"]

    if not best_hydrant:
        lines += [
            "  No nearby hydrant — water shuttle or open water required.",
            "  → Use find_open_water() and plan_water_shuttle().",
        ]
    else:
        # Strategy based on road distance to best hydrant
        if road_m <= 500:
            strategy = "HOSE LAY  (direct, short distance)"
            hoses = math.ceil(road_m / 20)
            lines += [
                f"  PRIMARY  : {strategy}",
                f"  Hoses    : {hoses}× B-hose (20 m)",
                f"  → Hydrant flow {best_hydrant['flow']} l/min {'≥' if best_hydrant['flow'] >= demand else '<'} demand {demand} l/min",
            ]
            if best_hydrant["flow"] < demand:
                lines.append(f"  WARNING  : Hydrant flow insufficient — use 2nd hydrant or supplement with shuttle.")

        elif road_m <= 1500:
            strategy = "WATER SHUTTLE  (borderline/medium distance)"
            if shuttle_n is not None:
                lines += [
                    f"  PRIMARY  : {strategy}",
                    f"  Vehicles : {shuttle_n}× {vehicle_type}",
                    f"  Delivery : {shuttle_rate * shuttle_n:.0f} l/min  (demand: {demand} l/min)",
                    f"  Alt      : hose lay with {relay_n} relay pump(s)",
                ]
            else:
                lines.append(f"  PRIMARY  : {strategy}")
        else:
            strategy = "RELAY PUMPING  (long distance)"
            b_relay = relay_n
            b_max_sec = _max_section_length(demand, "B")
            lines += [
                f"  PRIMARY  : {strategy}",
                f"  Relay pumps : {b_relay}×  (B-hose, {round(b_max_sec)} m sections at {demand} l/min)",
                f"  Parallel lines: {_parallel_lines(demand)}×",
                f"  Alt      : water shuttle with {shuttle_n}× {vehicle_type}" if shuttle_n else "",
            ]

    lines += [
        "",
        "─" * 55,
        "  5. NEXT STEPS FOR AGENT",
        f"  calculate_water_demand('{building_type}', '{fire_stage}')  → detailed demand",
        f"  analyze_hydrants('{location}')  → full hydrant list",
    ]
    if best_hydrant:
        lines += [
            f"  plan_water_shuttle(demand_l_min={demand}, incident_lat={lat:.4f}, incident_lon={lon:.4f},",
            f"    water_lat={best_hydrant['lat']:.4f}, water_lon={best_hydrant['lon']:.4f})",
            f"  plan_relay_pumping(flow_l_min={demand}, incident_lat={lat:.4f}, incident_lon={lon:.4f},",
            f"    water_lat={best_hydrant['lat']:.4f}, water_lon={best_hydrant['lon']:.4f})",
        ]
    lines.append("═" * 55)

    return "\n".join(l for l in lines if l is not None)


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        water_supply_overview,
        name="water_supply_overview",
        description=(
            "Generates a comprehensive water supply overview for an incident location. "
            "Combines: demand estimation, hydrant search, open water sources, "
            "shuttle and relay assessment — all in one report. "
            "Call this first at the start of an incident for a complete picture. "
            "Then use specific tools for detailed planning."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        print(await water_supply_overview(
            location="Marienplatz 1, München",
            building_type="commercial",
            fire_stage="developing",
        ))

    asyncio.run(main())
