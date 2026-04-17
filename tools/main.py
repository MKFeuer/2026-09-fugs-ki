from mcp.server.fastmcp import FastMCP

from generic import register_generic_tools
from geotools import register_geo_tools
from dwdtools import register_dwd_tools
from osmtools import register_osm_tools
from wikitool import register_wiki_tools

mcp = FastMCP("Tools", json_response=True)

register_generic_tools(mcp)
register_geo_tools(mcp)
register_dwd_tools(mcp)
register_osm_tools(mcp)
register_wiki_tools(mcp)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")

