"""OAuth 2.0 flow handler."""

import secrets
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode

import httpx


class OAuthFlowHandler:
    """Handles OAuth 2.0 authorization flows."""

    def __init__(self, token_store: Any):
        """Initialize OAuth flow handler.

        Args:
            token_store: Token store for state management
        """
        self.token_store = token_store

    async def get_authorization_url(
        self,
        oauth_config: Dict[str, Any],
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        scopes: list[str],
        state: Optional[str] = None,
    ) -> Tuple[str, str]:
        """Generate OAuth authorization URL.

        Args:
            oauth_config: OAuth configuration from provider
            client_id: OAuth client ID
            client_secret: OAuth client secret
            redirect_uri: Redirect URI
            scopes: List of scopes to request
            state: Optional state parameter

        Returns:
            Tuple of (authorization_url, state)
        """
        if not state:
            state = secrets.token_urlsafe(32)

        # Build authorization URL
        scope_separator = oauth_config.get("scope_separator", " ")
        scope_string = scope_separator.join(scopes)

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope_string,
            "state": state,
            "response_type": "code",
        }

        # Allow provider to customize params
        if "get_auth_params" in oauth_config:
            custom_params = oauth_config["get_auth_params"]({
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "scopes": scopes,
                "state": state,
            })
            params.update(custom_params)

        authorization_url = oauth_config["authorization_url"]
        url = f"{authorization_url}?{urlencode(params)}"

        return url, state

    async def exchange_code_for_token(
        self,
        oauth_config: Dict[str, Any],
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        code: str,
    ) -> Dict[str, Any]:
        """Exchange authorization code for access token.

        Args:
            oauth_config: OAuth configuration from provider
            client_id: OAuth client ID
            client_secret: OAuth client secret
            redirect_uri: Redirect URI
            code: Authorization code

        Returns:
            Token response dict

        Raises:
            Exception: If token exchange fails
        """
        token_url = oauth_config["token_url"]

        params = {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
            "grant_type": "authorization_code",
        }

        # Allow provider to customize params
        if "get_token_params" in oauth_config:
            custom_params = oauth_config["get_token_params"](
                {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                },
                code,
            )
            params.update(custom_params)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data=params,
                headers={"Accept": "application/json"},
            )

            if response.status_code != 200:
                raise Exception(
                    f"Token exchange failed: {response.status_code} {response.text}"
                )

            return response.json()

    async def refresh_token(
        self,
        oauth_config: Dict[str, Any],
        client_id: str,
        client_secret: str,
        refresh_token: str,
    ) -> Dict[str, Any]:
        """Refresh an access token.

        Args:
            oauth_config: OAuth configuration from provider
            client_id: OAuth client ID
            client_secret: OAuth client secret
            refresh_token: Refresh token

        Returns:
            Token response dict

        Raises:
            Exception: If token refresh fails
        """
        token_url = oauth_config["token_url"]

        params = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data=params,
                headers={"Accept": "application/json"},
            )

            if response.status_code != 200:
                raise Exception(
                    f"Token refresh failed: {response.status_code} {response.text}"
                )

            return response.json()
