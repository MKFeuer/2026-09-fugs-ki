import httpx
from html.parser import HTMLParser

from mcp.server.fastmcp import FastMCP

BASE_URL = "https://www.feuerwehr-lernbar.bayern"
API = f"{BASE_URL}/api"

_HEADERS = {
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}


class _StripHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts).strip()


async def search_wiki(suchbegriff: str, max_ergebnisse: int = 10) -> list[dict]:
    """Search the Feuerwehr-Lernbar knowledge base for a term.
    This is a Bavarian fire department wiki covering tactics, equipment, hazardous materials,
    rescue operations, and firefighting procedures.
    Returns a list of matches with ID, title and URL.
    The ID can be used with get_artikel().
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{API}/search/suggest",
            params={"search": suchbegriff},
            headers=_HEADERS,
        )
        r.raise_for_status()
        data = r.json()

    artikel = [
        {"id": a["id"], "titel": a["title"], "url": f"{BASE_URL}/post/{a['id']}", "typ": "article"}
        for a in data.get("articles", [])[:max_ergebnisse]
    ]
    topics = [
        {"id": t["id"], "titel": t["title"], "url": f"{BASE_URL}/topics/{t.get('identifier', t['id'])}", "typ": "topic"}
        for t in data.get("topics", [])
    ]
    return (artikel + topics)[:max_ergebnisse]


async def get_artikel(artikel_id: int) -> dict:
    """Fetch the full content of a Feuerwehr-Lernbar article by ID.
    Articles cover fire department operations, rescue procedures, equipment, and hazardous materials.
    The ID comes from the results of search_wiki().
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{API}/articles/{artikel_id}",
            headers=_HEADERS,
        )
        r.raise_for_status()
        data = r.json()

    parser = _StripHTML()
    for block in data.get("media", []):
        if block.get("type") == "wysiwyg" and block.get("wysiwyg"):
            parser.feed(block["wysiwyg"])

    return {
        "id": data["id"],
        "titel": data.get("title", ""),
        "inhalt": parser.get_text(),
        "zusammenfassung": data.get("preview_text") or "",
        "keywords": data.get("keywords") or "",
        "url": f"{BASE_URL}/post/{data['id']}",
        "zuletzt_geändert": data.get("updated_at") or "",
    }


async def list_wiki_alphabetisch(buchstabe: str, seite: int = 1) -> list[dict]:
    """List all Feuerwehr-Lernbar articles starting with a given letter (paginated).
    Useful for browsing the full fire department operations knowledge base alphabetically.
    Returns ID, title and URL for each entry.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{API}/search/suggest",
            params={"search": buchstabe},
            headers=_HEADERS,
        )
        r.raise_for_status()
        data = r.json()

    alle = [
        {"id": a["id"], "titel": a["title"], "url": f"{BASE_URL}/post/{a['id']}"}
        for a in data.get("articles", [])
        if a["title"].upper().startswith(buchstabe.upper())
    ]
    per_page = 20
    start = (seite - 1) * per_page
    return alle[start:start + per_page]


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        search_wiki,
        name="wiki_search",
        description=(
            "Search the Feuerwehr-Lernbar knowledge base (feuerwehr-lernbar.bayern) for a term. "
            "This Bavarian fire department wiki covers firefighting tactics, rescue operations, "
            "hazardous materials, vehicles, and equipment. Returns matches with ID, title and URL."
        ),
    )
    mcp.add_tool(
        get_artikel,
        name="wiki_get_artikel",
        description=(
            "Fetch the full text of a Feuerwehr-Lernbar article by ID. "
            "Articles cover fire department operations, rescue procedures, equipment, and hazardous materials. "
            "ID comes from wiki_search()."
        ),
    )
    mcp.add_tool(
        list_wiki_alphabetisch,
        name="wiki_list_alphabetisch",
        description=(
            "Browse the Feuerwehr-Lernbar fire department knowledge base alphabetically. "
            "Lists all articles starting with a given letter, paginated."
        ),
    )


if __name__ == "__main__":
    import asyncio

    async def main():
        ergebnisse = await search_wiki("Atemschutz")
        print(ergebnisse)
        if ergebnisse:
            artikel = await get_artikel(ergebnisse[0]["id"])
            print(artikel)

    asyncio.run(main())
