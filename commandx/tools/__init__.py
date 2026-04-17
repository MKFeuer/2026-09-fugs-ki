from mcp.server.fastmcp import FastMCP

from tools.mission import register_mission_tools
from tools.other import register_other_tools

def register_tools(mcp: FastMCP) -> None:
    register_mission_tools(mcp)
    register_other_tools(mcp)

