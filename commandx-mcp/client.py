import logging
import os
from typing import Any, Optional

import httpx

log = logging.getLogger("commandx")

HOST = os.environ.get("COMMANDX_HOST", "localhost:7000")
SEC_HEADER_NAME = os.environ.get("COMMANDX_SECURITY_HEADER_NAME", "X-Security-Token")
SEC_HEADER_VALUE = os.environ.get("COMMANDX_SECURITY_HEADER_VALUE", "")
BEARER_TOKEN = os.environ.get("COMMANDX_BEARER_TOKEN", "")
VERIFY_SSL = os.environ.get("COMMANDX_VERIFY_SSL", "true").lower() != "false"
USER_AGENT = os.environ.get("COMMANDX_USER_AGENT", "insomnia/12.5.0")

BASE_URL = f"https://{HOST}/api/v1"


class CIMgateClient:
    """HTTP-Client für die CIMgate.Connect REST API (statischer Bearer-Token)."""

    def _headers(self) -> dict[str, str]:
        return {
            SEC_HEADER_NAME: SEC_HEADER_VALUE,
            "Authorization": f"Bearer {BEARER_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        }

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        url = f"{BASE_URL}/rest-api/{path.lstrip('/')}"
        headers = self._headers()
        log.info("GET   %s  params=%s", url, params)
        log.info("GET   Headers: %s", headers)
        resp = httpx.get(
            url,
            headers=headers,
            params=params,
            verify=VERIFY_SSL,
            timeout=30,
        )
        log.info("      → %s", resp.status_code)
        resp.raise_for_status()
        return resp.json()
