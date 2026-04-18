from mcp.server.fastmcp import FastMCP

from osmtools.osm import register_tools as _register_osm_tools
from osmtools.hydrant import register_tools as _register_hydrant_tools
from osmtools.pendel import register_tools as _register_pendel_tools
from osmtools.demand import register_tools as _register_demand_tools
from osmtools.openwater import register_tools as _register_openwater_tools
from osmtools.relay import register_tools as _register_relay_tools
from osmtools.overview import register_tools as _register_overview_tools
from osmtools.routing import register_tools as _register_routing_tools


def register_osm_tools(mcp: FastMCP) -> None:
    _register_osm_tools(mcp)
    _register_hydrant_tools(mcp)
    _register_pendel_tools(mcp)
    _register_demand_tools(mcp)
    _register_openwater_tools(mcp)
    _register_relay_tools(mcp)
    _register_overview_tools(mcp)
    _register_routing_tools(mcp)
