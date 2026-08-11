"""HTTP client for making API requests."""

from typing import Any, Dict, Optional, cast

import httpx

from ..types import AuthType


class HttpClient:
    """HTTP client with authentication support."""

    def __init__(
        self,
        base_url: str,
        credentials: Dict[str, Any],
        auth_type: AuthType,
        logger: Any,
        timeout: int = 30,
    ):
        self.base_url = base_url.rstrip("/")
        self.credentials = credentials
        self.auth_type = auth_type
        self.logger = logger
        self.timeout = timeout

    def _get_auth_headers(self) -> Dict[str, str]:
        headers = {}

        if self.auth_type == AuthType.OAUTH2:
            access_token = self.credentials.get("access_token")
            if access_token:
                token_type = self.credentials.get("token_type", "Bearer")
                headers["Authorization"] = f"{token_type} {access_token}"
        elif self.auth_type == AuthType.API_KEY:
            api_key = self.credentials.get("api_key")
            header_name = self.credentials.get("header_name", "Authorization")
            prefix = self.credentials.get("prefix", "")
            if api_key:
                headers[header_name] = f"{prefix} {api_key}" if prefix else api_key

        return headers

    def _get_basic_auth(self) -> Optional[httpx.BasicAuth]:
        if self.auth_type != AuthType.BASIC:
            return None
        username = self.credentials.get("username")
        password = self.credentials.get("password")
        if username and password:
            return httpx.BasicAuth(username, password)
        return None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = self._get_auth_headers()
        headers.update(kwargs.pop("headers", {}))

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(
                method,
                url,
                params=params,
                data=data,
                json=json,
                headers=headers,
                auth=self._get_basic_auth(),
                **kwargs,
            )
            response.raise_for_status()
            if response.status_code == 204 or not response.content:
                return {}
            payload = response.json()
            if not isinstance(payload, dict):
                raise TypeError("Provider API response must be a JSON object")
            return cast(Dict[str, Any], payload)

    async def get(
        self, path: str, params: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Dict[str, Any]:
        return await self._request("GET", path, params=params, **kwargs)

    async def post(
        self,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        return await self._request("POST", path, data=data, json=json, **kwargs)

    async def put(
        self,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        return await self._request("PUT", path, data=data, json=json, **kwargs)

    async def patch(
        self,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        return await self._request("PATCH", path, data=data, json=json, **kwargs)

    async def delete(self, path: str, **kwargs: Any) -> Dict[str, Any]:
        return await self._request("DELETE", path, **kwargs)
