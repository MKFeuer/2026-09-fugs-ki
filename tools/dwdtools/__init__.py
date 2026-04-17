from mcp.server.fastmcp import FastMCP

from .dwd import register_tools as _register_dwd_tools


def register_dwd_tools(mcp: FastMCP) -> None:
    _register_dwd_tools(mcp)
