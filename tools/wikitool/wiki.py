import httpx
from html.parser import HTMLParser

from mcp.server.fastmcp import FastMCP

BASE_URL = "https://www.feuerwehr-lernbar.bayern"
API = f"{BASE_URL}/wp-json/wp/v2"


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
        r = await client.get(f"{API}/search", params={
            "search": suchbegriff,
            "per_page": max_ergebnisse,
            "type": "post",
            "_fields": "id,title,url,subtype",
        })
        r.raise_for_status()
    return [
        {
            "id": item["id"],
            "titel": item["title"],
            "url": item["url"],
            "typ": item.get("subtype", "post"),
        }
        for item in r.json()
    ]


async def get_artikel(artikel_id: int) -> dict:
    """Fetch the full content of a Feuerwehr-Lernbar article by ID.
    Articles cover fire department operations, rescue procedures, equipment, and hazardous materials.
    The ID comes from the results of search_wiki().
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{API}/posts/{artikel_id}", params={
            "_fields": "id,title,content,excerpt,link,date_modified",
        })
        r.raise_for_status()
        data = r.json()

    parser = _StripHTML()
    parser.feed(data["content"]["rendered"])

    return {
        "id": data["id"],
        "titel": data["title"]["rendered"],
        "inhalt": parser.get_text(),
        "zusammenfassung": data["excerpt"]["rendered"].replace("<p>", "").replace("</p>", "").strip(),
        "url": data["link"],
        "zuletzt_geändert": data["date_modified"],
    }


async def list_wiki_alphabetisch(buchstabe: str, seite: int = 1) -> list[dict]:
    """List all Feuerwehr-Lernbar articles starting with a given letter (paginated).
    Useful for browsing the full fire department operations knowledge base alphabetically.
    Returns ID, title and URL for each entry.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{API}/posts", params={
            "search": buchstabe,
            "per_page": 20,
            "page": seite,
            "orderby": "title",
            "order": "asc",
            "_fields": "id,title,link",
        })
        r.raise_for_status()
    return [
        {"id": p["id"], "titel": p["title"]["rendered"], "url": p["link"]}
        for p in r.json()
    ]


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
