from mcp.server.fastmcp import FastMCP

from osmtools.osm import register_tools as _register_osm_tools


def register_osm_tools(mcp: FastMCP) -> None:
    _register_osm_tools(mcp)
