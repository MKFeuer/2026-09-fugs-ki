from mcp.server.fastmcp import FastMCP

from tools import register_tools

mcp = FastMCP("CommandX", json_response=True)

register_tools(mcp)

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
