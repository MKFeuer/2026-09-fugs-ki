import asyncio
import hashlib
import json
import math
import random
import time
from pathlib import Path
from typing import Optional

import requests
from mcp.server.fastmcp import FastMCP

BBOX_MUNICH = [47.8500, 11.1500, 48.4500, 12.0500]  # min_lat, min_lon, max_lat, max_lon

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

_HEADERS = {"User-Agent": "FugsKI-OverpassTool/1.0"}
_RETRYABLE_STATUS_CODES = {429, 503, 504}
_DEFAULT_CACHE_TTL_S = 24 * 3600
_DEFAULT_MAXSIZE = 512 * 1024 * 1024
_CACHE_DIR = Path("/tmp/fugski_overpass_cache")
_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def radius_to_bbox(lat: float, lon: float, radius_m: float) -> list[float]:
    """Approximate a radius around a point as a bounding box."""
    lat_delta = radius_m / 111_320
    lon_delta = radius_m / (111_320 * max(abs(math.cos(math.radians(lat))), 0.1))
    return [lat - lat_delta, lon - lon_delta, lat + lat_delta, lon + lon_delta]


def split_bbox(bbox: list[float], parts: int = 4) -> list[tuple[float, float, float, float]]:
    """Split a bbox into a parts x parts grid for sequential Overpass queries."""
    if parts <= 1:
        min_lat, min_lon, max_lat, max_lon = bbox
        return [(min_lat, min_lon, max_lat, max_lon)]

    min_lat, min_lon, max_lat, max_lon = bbox
    lat_step = (max_lat - min_lat) / parts
    lon_step = (max_lon - min_lon) / parts
    tiles = []
    for i in range(parts):
        for j in range(parts):
            tiles.append((
                min_lat + i * lat_step,
                min_lon + j * lon_step,
                min_lat + (i + 1) * lat_step,
                min_lon + (j + 1) * lon_step,
            ))
    return tiles


def _cache_path(full_query: str) -> Path:
    digest = hashlib.md5(full_query.encode("utf-8")).hexdigest()
    return _CACHE_DIR / f"{digest}.json"


def _load_cached_response(full_query: str, cache_ttl_s: int) -> dict | None:
    if cache_ttl_s <= 0:
        return None

    cache_file = _cache_path(full_query)
    if not cache_file.exists():
        return None

    age_s = time.time() - cache_file.stat().st_mtime
    if age_s > cache_ttl_s:
        return None

    try:
        return json.loads(cache_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _save_cached_response(full_query: str, payload: dict) -> None:
    cache_file = _cache_path(full_query)
    try:
        cache_file.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass


def _format_bbox(bbox: list[float] | tuple[float, float, float, float]) -> str:
    return ",".join(f"{coord:.7f}" for coord in bbox)


def _build_overpass_query(query: str, timeout: int, maxsize: int | None) -> str:
    prefix = f"[out:json][timeout:{timeout}]"
    if maxsize is not None:
        prefix += f"[maxsize:{maxsize}]"
    return f"{prefix};\n{query.strip()}"


def _retry_wait_s(attempt: int, status_code: int | None = None) -> float:
    if status_code in _RETRYABLE_STATUS_CODES:
        return min((2 ** attempt) * 3 + random.uniform(0, 1), 60)
    return min(2 ** attempt + random.uniform(0, 1), 30)


def _fetch_overpass_json(
    full_query: str,
    timeout: int,
    cache_ttl_s: int = _DEFAULT_CACHE_TTL_S,
    max_retries: int = 4,
) -> dict:
    cached = _load_cached_response(full_query, cache_ttl_s)
    if cached is not None:
        return cached

    endpoints = OVERPASS_ENDPOINTS.copy()
    random.shuffle(endpoints)
    last_error: Exception | None = None

    for attempt in range(max_retries):
        endpoint = endpoints[attempt % len(endpoints)]
        try:
            response = requests.post(
                endpoint,
                data={"data": full_query},
                headers=_HEADERS,
                timeout=(5, timeout + 5),
            )
            response.raise_for_status()
            payload = response.json()
            _save_cached_response(full_query, payload)
            return payload
        except requests.exceptions.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            last_error = exc
            if status_code not in _RETRYABLE_STATUS_CODES or attempt == max_retries - 1:
                raise
            time.sleep(_retry_wait_s(attempt, status_code))
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            last_error = exc
            if attempt == max_retries - 1:
                break
            time.sleep(_retry_wait_s(attempt))

    raise ConnectionError(f"Alle Overpass-Server nicht erreichbar. Letzter Fehler: {last_error}")


def _query_with_bbox(
    query: str,
    bbox: list[float] | tuple[float, float, float, float] | None,
    timeout: int,
    cache_ttl_s: int,
    maxsize: int | None,
) -> dict:
    if bbox is not None and "{bbox}" in query:
        query = query.replace("{bbox}", _format_bbox(bbox))
    full_query = _build_overpass_query(query, timeout=timeout, maxsize=maxsize)
    return _fetch_overpass_json(full_query, timeout=timeout, cache_ttl_s=cache_ttl_s)


def overpass_query(
    query: str,
    bbox: Optional[list[float]] = None,  # defaults to Munich if omitted
    timeout: int = 60,
) -> dict:
    """Execute an Overpass QL query and return the result as a dict.

    query: Overpass QL query string. Use {bbox} as placeholder for the bounding box.
    bbox: Optional bounding box as [min_lat, min_lon, max_lat, max_lon].
    timeout: Query timeout in seconds.
    """
    if bbox is None:
        bbox = BBOX_MUNICH
    return _query_with_bbox(
        query,
        bbox=bbox,
        timeout=timeout,
        cache_ttl_s=_DEFAULT_CACHE_TTL_S,
        maxsize=_DEFAULT_MAXSIZE,
    )


async def overpass_query_async(
    query: str,
    bbox: Optional[list[float]] = None,
    timeout: int = 60,
) -> dict:
    return await asyncio.to_thread(overpass_query, query, bbox, timeout)


def overpass_elements_by_bbox(
    query: str,
    bbox: list[float],
    timeout: int = 30,
    tile_parts: int = 1,
    cache_ttl_s: int = _DEFAULT_CACHE_TTL_S,
) -> list[dict]:
    """Execute a bbox-based query, optionally tile it, and merge/dedupe elements."""
    if "{bbox}" not in query:
        raise ValueError("BBox query must contain a {bbox} placeholder for tiling.")

    merged: list[dict] = []
    seen: set[tuple[str | None, int | None]] = set()
    for tile in split_bbox(bbox, parts=tile_parts):
        data = _query_with_bbox(
            query,
            bbox=tile,
            timeout=timeout,
            cache_ttl_s=cache_ttl_s,
            maxsize=_DEFAULT_MAXSIZE,
        )
        for element in data.get("elements", []):
            key = (element.get("type"), element.get("id"))
            if key in seen:
                continue
            seen.add(key)
            merged.append(element)
    return merged


async def overpass_elements_by_bbox_async(
    query: str,
    bbox: list[float],
    timeout: int = 30,
    tile_parts: int = 1,
    cache_ttl_s: int = _DEFAULT_CACHE_TTL_S,
) -> list[dict]:
    return await asyncio.to_thread(
        overpass_elements_by_bbox,
        query,
        bbox,
        timeout,
        tile_parts,
        cache_ttl_s,
    )


def register_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        overpass_query,
        name="osm_overpass_query",
        description=(
            "Executes an Overpass QL query against OpenStreetMap and returns the matching elements. "
            "Use {bbox} in the query string as a placeholder when providing a bounding box. "
            "bbox must be [min_lat, min_lon, max_lat, max_lon]. "
            "Queries are cached briefly and retried across multiple endpoints to reduce 504 errors."
        ),
    )


if __name__ == "__main__":
    query = """
    node["amenity"="cafe"]({bbox});
    out center qt;
    """
    bbox_berlin = [52.3383, 13.0884, 52.6755, 13.7611]
    data = overpass_query(query, bbox=bbox_berlin)
    elements = data.get("elements", [])
    print(f"{len(elements)} Cafes in Berlin gefunden.")
