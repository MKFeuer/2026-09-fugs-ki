from datetime import datetime

from mcp.server.fastmcp import FastMCP


def get_current_time() -> str:
    """Return the current local date and time as a string."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        get_current_time,
        name="get_current_time",
        description="Returns the current local date and time as a string.",
    )
