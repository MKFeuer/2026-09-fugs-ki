from mcp.server.fastmcp import FastMCP
from dwd import register_tools as register_dwd_tools

def register_tools(mcp: FastMCP) -> None:
    register_dwd_tools(mcp)
