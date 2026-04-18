from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from tools import register_tools

mcp = FastMCP("CommandX", json_response=True, host="0.0.0.0")


@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})

register_tools(mcp)

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
