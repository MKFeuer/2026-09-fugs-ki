from mcp.server.fastmcp import FastMCP

from generic import register_generic_tools


mcp = FastMCP("CommandX", json_response=True)


@mcp.tool("hello")
def hello() -> str:
    return "Hello from CommandX!"


register_generic_tools(mcp)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
