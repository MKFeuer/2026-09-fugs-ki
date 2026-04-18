import logging
from typing import Any

from config import Settings

import httpx

log = logging.getLogger("commandx")

class CIMgateClient:
    """HTTP-Client für die CIMgate.Connect REST API (statischer Bearer-Token)."""

    settings: Settings
    _base_url: str
    _sec_header_name: str
    _sec_header_value: str
    _bearer_token: str
    _verify_ssl: bool
    _user_agent: str

    def __init__(self, settings: Settings | None = None) -> None:
        if settings is None:
            self.settings = Settings()  # pyright: ignore[reportCallIssue]
        else:
            self.settings = settings
            
        self._base_url = f"https://{self.settings.commandx_host}/api/v1"
        self._sec_header_name = self.settings.commandx_security_header_name
        self._sec_header_value = self.settings.commandx_security_header_value
        self._bearer_token = self.settings.commandx_bearer_token
        self._verify_ssl = self.settings.commandx_verify_ssl
        self._user_agent = self.settings.commandx_user_agent

    def _headers(self) -> dict[str, str]:
        return {
            self._sec_header_name: self._sec_header_value,
            "Authorization": f"Bearer {self._bearer_token}",
            "Content-Type": "application/json",
            "User-Agent": self._user_agent,
        }

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
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
    
    def post(self, path: str, json: dict[str, Any]) -> Any:
        url = f"{self._base_url}/rest-api/{path.lstrip('/')}"
        headers = self._headers()
        log.info("POST  %s  json=%s", url, json)
        log.info("POST  Headers: %s", headers)
        resp = httpx.post(
            url,
            headers=headers,
            json=json,
            verify=self._verify_ssl,
            timeout=30,
        )
        log.info("      → %s", resp.status_code)
        resp.raise_for_status()
        return resp.json()
