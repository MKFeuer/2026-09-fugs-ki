import asyncio

import pytest

import osmtools.overview as overview
from osmtools import register_osm_tools
from osmtools.hydrant import _parse_flow_rate
from osmtools.pendel import _cycle_time
from osmtools.pendel import _delivery_rate
from osmtools.pendel import _recommendation
from osmtools.pendel import _vehicles_required
from osmtools.relay import _max_section_length
from osmtools.relay import _parallel_lines
from osmtools.relay import _relay_stations


class DummyMCP:
    def __init__(self):
        self.tool_names = []

    def add_tool(self, func, name=None, description=None):
        self.tool_names.append(name or func.__name__)


def test_register_osm_tools_registers_expected_names():
    mcp = DummyMCP()

    register_osm_tools(mcp)

    assert sorted(mcp.tool_names) == [
        "analyze_hydrants",
        "calculate_hose_requirements",
        "calculate_water_demand",
        "find_open_water",
        "geocode_location",
        "list_building_types",
        "list_vehicle_types",
        "osm_overpass_query",
        "plan_mixed_fleet_shuttle",
        "plan_relay_pumping",
        "plan_water_shuttle",
        "water_supply_overview",
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("60 m³/h", 1000),
        ("72000 l/h", 1200),
        ("800 l/min", 800),
    ],
)
def test_parse_flow_rate_supports_common_units(raw, expected):
    flow, estimated = _parse_flow_rate(raw, "pillar")

    assert flow == expected
    assert estimated is False


def test_parse_flow_rate_falls_back_to_type_default_for_invalid_values():
    flow, estimated = _parse_flow_rate("unknown", "pillar")

    assert flow == 1200
    assert estimated is True


def test_relay_helpers_calculate_sections_and_parallel_lines():
    assert _max_section_length(800, "B") == pytest.approx(800.0)
    assert _relay_stations(2500, 800, "B") == 3
    assert _parallel_lines(1600) == 2


def test_shuttle_helpers_calculate_cycle_delivery_and_vehicle_count():
    cycle = _cycle_time(drive_min=3, tank_l=3000, pump_l_min=1000, fill_min=4)

    assert cycle == pytest.approx(15.0)
    assert _delivery_rate(3000, cycle) == pytest.approx(200.0)
    assert _vehicles_required(1600, 3000, cycle) == 8
    assert _recommendation(700, 4) == "HOSE LAY preferred — too many vehicles required for shuttle."


def test_water_supply_overview_prefers_hose_lay_for_short_distance(monkeypatch):
    async def fake_geocode(location):
        return {"lat": 48.1375, "lon": 11.5747, "address": "Marienplatz 1, Muenchen"}

    async def fake_find_hydrants(lat, lon, radius):
        return [{
            "id": 123,
            "label": "Pillar Hydrant",
            "distance_m": 35,
            "flow": 1600,
            "estimated": False,
            "lat": 48.1378,
            "lon": 11.5750,
        }]

    async def fake_find_open_water(lat, lon, radius):
        return []

    async def fake_route(*args, **kwargs):
        return 0.4, 40.0

    monkeypatch.setattr(overview, "_geocode", fake_geocode)
    monkeypatch.setattr(overview, "_find_hydrants", fake_find_hydrants)
    monkeypatch.setattr(overview, "_find_open_water", fake_find_open_water)
    monkeypatch.setattr(overview, "_route", fake_route)

    report = asyncio.run(
        overview.water_supply_overview(
            location="Marienplatz 1, München",
            building_type="commercial",
            fire_stage="developing",
            radius_m=300,
            vehicle_type="TLF 3000",
        )
    )

    assert "PRIMARY  : HOSE LAY  (direct, short distance)" in report
    assert "Hoses    : 2× B-hose (20 m)" in report
    assert "Hydrant flow 1600 l/min ≥ demand 1200 l/min" in report


def test_water_supply_overview_without_hydrant_points_to_shuttle(monkeypatch):
    async def fake_geocode(location):
        return {"lat": 48.1375, "lon": 11.5747, "address": "Remote barn"}

    async def fake_find_hydrants(lat, lon, radius):
        return []

    async def fake_find_open_water(lat, lon, radius):
        return [{
            "label": "River",
            "name": "Isar",
            "distance_m": 900,
            "lat": 48.1300,
            "lon": 11.5800,
        }]

    monkeypatch.setattr(overview, "_geocode", fake_geocode)
    monkeypatch.setattr(overview, "_find_hydrants", fake_find_hydrants)
    monkeypatch.setattr(overview, "_find_open_water", fake_find_open_water)

    report = asyncio.run(
        overview.water_supply_overview(
            location="Remote barn",
            building_type="agricultural",
            fire_stage="developing",
            radius_m=500,
            vehicle_type="TLF 3000",
        )
    )

    assert "NO hydrants found within 500 m." in report
    assert "Type     : River (Isar)" in report
    assert "No nearby hydrant — water shuttle or open water required." in report
    assert "→ Use find_open_water() and plan_water_shuttle()." in report
