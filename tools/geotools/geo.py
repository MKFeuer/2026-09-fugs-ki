from mcp.server.fastmcp import FastMCP
from geographiclib.geodesic import Geodesic


def distance_wgs84_geodesic(lat1, lon1, lat2, lon2):
    g = Geodesic.WGS84.Inverse(lat1, lon1, lat2, lon2)
    return g["s12"]  # Distanz in Metern

def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        distance_wgs84_geodesic,
        name="get_distance_between_points",
        description="Returns the geodesic distance between two points on the Earth's surface in meters.",
    )