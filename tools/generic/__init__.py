from mcp.server.fastmcp import FastMCP

from .time import register_tools as register_time_tools


def register_generic_tools(mcp: FastMCP) -> None:
    register_time_tools(mcp)
