import asyncio

import pytest

import osmtools.overview as overview
import osmtools.openwater as openwater
import osmtools.osm as osm
import osmtools.routing as routing
import osmtools.hydrant as hydrant
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
        "find_access_roads",
        "find_open_water",
        "find_staging_areas",
        "geocode_location",
        "get_road_info",
        "get_route",
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


def test_get_route_returns_canvas_waypoints(monkeypatch):
    async def fake_parse_location(location):
        if location == "A":
            return {"lat": 48.1, "lon": 11.5, "address": "Start"}
        return {"lat": 48.2, "lon": 11.6, "address": "Ziel"}

    async def fake_osrm_route(*args, **kwargs):
        return {
            "distance": 1450.0,
            "duration": 240.0,
            "geometry": {
                "coordinates": [
                    [11.5, 48.1],
                    [11.55, 48.15],
                    [11.6, 48.2],
                ]
            },
        }

    monkeypatch.setattr(routing, "_parse_location", fake_parse_location)
    monkeypatch.setattr(routing, "_osrm_route", fake_osrm_route)

    report = asyncio.run(routing.get_route("A", "B"))

    assert "STRECKENFÜHRUNG (OSRM)" in report
    assert '[{"lat":48.1,"lng":11.5},{"lat":48.15,"lng":11.55},{"lat":48.2,"lng":11.6}]' in report


def test_find_staging_areas_handles_non_numeric_capacity(monkeypatch):
    async def fake_parse_location(location):
        return {"lat": 48.1375, "lon": 11.5747, "address": location}

    def fake_overpass_query(query):
        return {
            "elements": [
                {
                    "type": "way",
                    "center": {"lat": 48.1380, "lon": 11.5750},
                    "tags": {
                        "amenity": "parking",
                        "name": "Innenhof",
                        "capacity": "ca. 12",
                    },
                },
                {
                    "type": "way",
                    "center": {"lat": 48.1384, "lon": 11.5754},
                    "tags": {
                        "amenity": "parking",
                        "name": "Kleiner Platz",
                        "capacity": "wenige",
                    },
                },
            ]
        }

    monkeypatch.setattr(routing, "_parse_location", fake_parse_location)
    monkeypatch.setattr(routing, "overpass_query", fake_overpass_query)

    report = asyncio.run(routing.find_staging_areas("Einsatzort", radius_m=400))

    assert "BEREITSTELLUNGSRÄUME" in report
    assert "Innenhof" in report
    assert "Kleiner Platz" in report


def test_overpass_elements_by_bbox_tiles_and_dedupes(monkeypatch):
    calls = []

    def fake_query_with_bbox(query, bbox, timeout, cache_ttl_s, maxsize):
        calls.append(tuple(round(coord, 3) for coord in bbox))
        return {
            "elements": [
                {"type": "node", "id": 1},
                {"type": "node", "id": len(calls) + 1},
            ]
        }

    monkeypatch.setattr(osm, "_query_with_bbox", fake_query_with_bbox)

    elements = osm.overpass_elements_by_bbox(
        'node["amenity"="cafe"]({bbox}); out body qt;',
        bbox=[0.0, 0.0, 2.0, 2.0],
        tile_parts=2,
        cache_ttl_s=0,
    )

    assert len(calls) == 4
    assert sorted((element["type"], element["id"]) for element in elements) == [
        ("node", 1),
        ("node", 2),
        ("node", 3),
        ("node", 4),
        ("node", 5),
    ]


def test_find_hydrants_uses_bbox_query_and_filters_to_radius(monkeypatch):
    captured = {}

    async def fake_overpass_elements(query, bbox, timeout, tile_parts, cache_ttl_s):
        captured["query"] = query
        captured["bbox"] = bbox
        captured["timeout"] = timeout
        captured["tile_parts"] = tile_parts
        captured["cache_ttl_s"] = cache_ttl_s
        return [
            {
                "id": 1,
                "type": "node",
                "lat": 48.1377,
                "lon": 11.5748,
                "tags": {"emergency": "fire_hydrant", "flow_rate": "1200"},
            },
            {
                "id": 2,
                "type": "node",
                "lat": 48.1450,
                "lon": 11.5748,
                "tags": {"emergency": "fire_hydrant", "flow_rate": "1200"},
            },
        ]

    monkeypatch.setattr(hydrant, "overpass_elements_by_bbox_async", fake_overpass_elements)

    results = asyncio.run(hydrant._find_hydrants(48.1375, 11.5747, 300))

    assert len(results) == 1
    assert results[0]["id"] == 1
    assert "{bbox}" in captured["query"]
    assert "out body qt;" in captured["query"]
    assert captured["tile_parts"] == 1


def test_find_open_water_uses_bbox_query_and_filters_to_radius(monkeypatch):
    captured = {}

    async def fake_overpass_elements(query, bbox, timeout, tile_parts, cache_ttl_s):
        captured["query"] = query
        captured["bbox"] = bbox
        captured["timeout"] = timeout
        captured["tile_parts"] = tile_parts
        captured["cache_ttl_s"] = cache_ttl_s
        return [
            {
                "id": 10,
                "type": "way",
                "center": {"lat": 48.1378, "lon": 11.5748},
                "tags": {"natural": "water", "name": "Weiher"},
            },
            {
                "id": 11,
                "type": "way",
                "center": {"lat": 48.1550, "lon": 11.5748},
                "tags": {"natural": "water", "name": "Fernsee"},
            },
        ]

    monkeypatch.setattr(openwater, "overpass_elements_by_bbox_async", fake_overpass_elements)

    results = asyncio.run(openwater._find_open_water(48.1375, 11.5747, 500))

    assert len(results) == 1
    assert results[0]["id"] == 10
    assert "{bbox}" in captured["query"]
    assert "out center qt;" in captured["query"]
    assert captured["tile_parts"] == 1
