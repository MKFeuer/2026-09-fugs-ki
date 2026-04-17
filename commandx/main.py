import logging

from mcp.server.fastmcp import FastMCP

from client import CIMgateClient
from tools import register_tools

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("commandx")

client = CIMgateClient()

mcp = FastMCP("CommandX", json_response=True)

register_tools(mcp)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
