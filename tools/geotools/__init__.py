from mcp.server.fastmcp import FastMCP

from geotools.geo import register_tools as _register_geo_tools


def register_geo_tools(mcp: FastMCP) -> None:
    _register_geo_tools(mcp)
