from mcp.server.fastmcp import FastMCP

from generic import register_generic_tools
from geotools import register_geo_tools

mcp = FastMCP("Tools", json_response=True)


@mcp.tool("hello")
def hallo() -> str:
    return "Hello from tools!"

register_generic_tools(mcp)
register_geo_tools(mcp)


if __name__ == "__main__":
    from geotools import distance_wgs84_geodesic
    #d = distance_wgs84_geodesic(52.52042741543588, 13.405782162596813, 52.52074696727995, 13.406442521399553)
    #print(f"Distance between Munich and Berlin: {d:.2f} meters")
    mcp.run(transport="streamable-http")

