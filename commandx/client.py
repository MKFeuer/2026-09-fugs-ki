import logging
import os
from typing import Any, Optional

import httpx

log = logging.getLogger("commandx")

class CIMgateClient:
    """HTTP-Client für die CIMgate.Connect REST API (statischer Bearer-Token)."""

    def __init__(self) -> None:
        host = os.environ.get("COMMANDX_HOST", "localhost:7000")
        self._base_url = f"https://{host}/api/v1"
        self._sec_header_name = os.environ.get("COMMANDX_SECURITY_HEADER_NAME", "X-Security-Token")
        self._sec_header_value = os.environ.get("COMMANDX_SECURITY_HEADER_VALUE", "")
        self._bearer_token = os.environ.get("COMMANDX_BEARER_TOKEN", "")
        self._verify_ssl = os.environ.get("COMMANDX_VERIFY_SSL", "true").lower() != "false"
        self._user_agent = os.environ.get("COMMANDX_USER_AGENT", "insomnia/12.5.0")

    def _headers(self) -> dict[str, str]:
        return {
            self._sec_header_name: self._sec_header_value,
            "Authorization": f"Bearer {self._bearer_token}",
            "Content-Type": "application/json",
            "User-Agent": self._user_agent,
        }

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        url = f"{self._base_url}/rest-api/{path.lstrip('/')}"
        headers = self._headers()
        log.info("GET   %s  params=%s", url, params)
        log.info("GET   Headers: %s", headers)
        resp = httpx.get(
            url,
            headers=headers,
            params=params,
            verify=self._verify_ssl,
            timeout=30,
        )
        log.info("      → %s", resp.status_code)
        resp.raise_for_status()
        return resp.json()
