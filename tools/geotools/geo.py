from mcp.server.fastmcp import FastMCP
from geographiclib.geodesic import Geodesic
from shapely.geometry import Point, Polygon


def distance_wgs84_geodesic(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Calculate the distance between two points on the Earth's surface using the WGS84 geodesic."""
    lat1, lon1 = p1
    lat2, lon2 = p2
    g = Geodesic.WGS84.Inverse(lat1, lon1, lat2, lon2)
    return g["s12"]  # Distanz in Metern

def point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    """Check if a point is inside a polygon, or not.
    point: (latitude, longitude)
    polygon: list of (latitude, longitude) tuples defining the vertices of the polygon
    Returns True if the point is inside the polygon, False otherwise.
    """
    point = Point(point[1], point[0])  # Shapely verwendet (lon, lat) Reihenfolge
    polygon = Polygon([(lon, lat) for lat, lon in polygon])  # Shapely verwendet (lon, lat) Reihenfolge
    return polygon.contains(point)

def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        distance_wgs84_geodesic,
        name="get_distance_between_points",
        description="Returns the geodesic distance between two points on the Earth's surface in meters.",
    )
    mcp.add_tool(
        point_in_polygon,
        name="point_in_polygon",
        description="Checks if a point is inside a polygon. Returns True if the point is inside the polygon, False otherwise.",
    )