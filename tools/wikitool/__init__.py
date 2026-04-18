from mcp.server.fastmcp import FastMCP

from wikitool.wiki import register_tools as _register_wiki_tools


def register_wiki_tools(mcp: FastMCP) -> None:
    _register_wiki_tools(mcp)
