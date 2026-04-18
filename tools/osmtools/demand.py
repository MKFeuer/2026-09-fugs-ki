from datetime import datetime
from mcp.server.fastmcp import FastMCP

# Based on DVGW W 405 / FwDV / Bavarian fire service practice
BUILDING_DEMAND: dict[str, dict] = {
    "residential_small": {
        "label": "Small residential (1-2 stories, single/double family)",
        "incipient": 400, "developing": 600, "fully_developed": 800,
        "note": "DVGW W 405 category I",
    },
    "residential_large": {
        "label": "Large residential (apartment block, MFH)",
        "incipient": 800, "developing": 1200, "fully_developed": 1600,
        "note": "DVGW W 405 category II",
    },
    "commercial": {
        "label": "Commercial / office",
        "incipient": 800, "developing": 1200, "fully_developed": 1600,
        "note": "DVGW W 405 category II",
    },
    "retail": {
        "label": "Retail / shopping center",
        "incipient": 1600, "developing": 2000, "fully_developed": 2400,
        "note": "High fire load",
    },
    "industrial_light": {
        "label": "Light industry / workshop",
        "incipient": 1600, "developing": 2400, "fully_developed": 3200,
        "note": "DVGW W 405 category III",
    },
    "industrial_heavy": {
        "label": "Heavy industry / chemical plant",
        "incipient": 3200, "developing": 4800, "fully_developed": 6400,
        "note": "High fire load — possible chemical hazard, request HazMat resources",
    },
    "warehouse": {
        "label": "Warehouse / logistics",
        "incipient": 1600, "developing": 2400, "fully_developed": 3200,
        "note": "Demand depends on stored goods — may require upward adjustment",
    },
    "agricultural": {
        "label": "Agricultural building / barn",
        "incipient": 400, "developing": 600, "fully_developed": 800,
        "note": "Often outside hydrant coverage — consider water shuttle",
    },
    "highrise": {
        "label": "High-rise (> 8 stories)",
        "incipient": 1600, "developing": 2400, "fully_developed": 3200,
        "note": "Internal wet riser may supplement supply — coordinate with building systems",
    },
    "hospital": {
        "label": "Hospital / care home",
        "incipient": 800, "developing": 1200, "fully_developed": 1600,
        "note": "Evacuation is priority — request water early",
    },
    "school": {
        "label": "School / public building",
        "incipient": 800, "developing": 1200, "fully_developed": 1600,
        "note": "DVGW W 405 category II",
    },
    "vehicle": {
        "label": "Vehicle fire",
        "incipient": 200, "developing": 300, "fully_developed": 400,
        "note": "Single vehicle — multiply for HGV, bus, or multiple vehicles",
    },
    "forest": {
        "label": "Forest / wildland fire (per hectare)",
        "incipient": 200, "developing": 300, "fully_developed": 400,
        "note": "Per hectare of involved area — multiply by estimated fire size",
    },
}

FIRE_STAGES = ("incipient", "developing", "fully_developed")


async def calculate_water_demand(
    building_type: str,
    fire_stage: str = "developing",
    area_m2: int | None = None,
    exposure_protection: bool = False,
) -> str:
    """Estimates required water demand for a fire incident based on building type and fire stage.

    Returns demand in l/min per DVGW W 405 / FwDV.
    Use the result as input for analyze_hydrants(), plan_water_shuttle(), or plan_relay_pumping().

    AGENT: Call this first to determine demand before planning water supply.
    Available building_type values: residential_small, residential_large, commercial,
    retail, industrial_light, industrial_heavy, warehouse, agricultural, highrise,
    hospital, school, vehicle, forest.
    Fire stages: incipient, developing, fully_developed.
    """
    btype = building_type.lower().strip()
    stage = fire_stage.lower().strip()

    if btype not in BUILDING_DEMAND:
        available = ", ".join(BUILDING_DEMAND.keys())
        return f"Unknown building type '{building_type}'.\nAvailable: {available}"

    if stage not in FIRE_STAGES:
        return f"Unknown fire stage '{fire_stage}'. Use: incipient, developing, fully_developed"

    info = BUILDING_DEMAND[btype]
    base_demand = info[stage]

    if exposure_protection:
        exposure_add = round(base_demand * 0.5 / 100) * 100  # round to 100
        total = base_demand + exposure_add
    else:
        exposure_add = 0
        total = base_demand

    ts = datetime.now().strftime("%Y-%m-%d  %H:%M")
    lines = [
        "═" * 55,
        f"  WATER DEMAND ESTIMATE  •  {ts}",
        "═" * 55,
        f"  Building type  : {info['label']}",
        f"  Fire stage     : {stage.replace('_', ' ').title()}",
    ]

    if area_m2:
        lines.append(f"  Floor area     : {area_m2:,} m²")
        if btype == "forest":
            area_ha = area_m2 / 10_000
            total = round(base_demand * area_ha / 100) * 100
            lines.append(f"  Fire area      : {area_ha:.1f} ha")

    lines += [
        "",
        "─" * 55,
        f"  Base demand    : {base_demand} l/min",
    ]

    if exposure_protection:
        lines += [
            f"  Exposure prot. : +{exposure_add} l/min  (+50%)",
        ]

    lines += [
        f"  ─────────────────────────────",
        f"  TOTAL DEMAND   : {total} l/min",
        "",
        f"  Note: {info['note']}",
        "",
        "─" * 55,
        "  DEMAND SCALE (this building type)",
        f"  Incipient      : {info['incipient']} l/min",
        f"  Developing     : {info['developing']} l/min",
        f"  Fully developed: {info['fully_developed']} l/min",
        "═" * 55,
    ]
    return "\n".join(lines)


async def list_building_types() -> str:
    """Lists all supported building types for calculate_water_demand()."""
    lines = [
        "═" * 55,
        "  BUILDING TYPES  (for calculate_water_demand)",
        "═" * 55,
        f"  {'Key':<22} {'Demand range (l/min)':>20}",
        "─" * 55,
    ]
    for key, info in BUILDING_DEMAND.items():
        rng = f"{info['incipient']}–{info['fully_developed']}"
        lines.append(f"  {key:<22} {rng:>20}")
    lines += [
        "─" * 55,
        "  Fire stages: incipient | developing | fully_developed",
        "═" * 55,
    ]
    return "\n".join(lines)


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        calculate_water_demand,
        name="calculate_water_demand",
        description=(
            "Estimates required water demand (l/min) for a fire incident based on building type and fire stage. "
            "Based on DVGW W 405 / FwDV. Use the result as input for analyze_hydrants(), "
            "plan_water_shuttle(), or plan_relay_pumping(). Call this first to determine demand."
        ),
    )
    mcp.add_tool(
        list_building_types,
        name="list_building_types",
        description=(
            "Lists all supported building types and their demand ranges for calculate_water_demand()."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        print(await list_building_types())
        print()
        print(await calculate_water_demand("industrial_light", "fully_developed", exposure_protection=True))

    asyncio.run(main())
