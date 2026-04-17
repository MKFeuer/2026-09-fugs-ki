from mcp.server.fastmcp import FastMCP

from geotools.geo import register_tools as register_geo_tools
from geotools.geo import distance_wgs84_geodesic

def register_tools(mcp: FastMCP) -> None:
    register_geo_tools(mcp)
