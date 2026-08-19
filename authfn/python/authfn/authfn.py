"""Main authfn implementation."""

import secrets
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from superfunctions.db import Adapter as DatabaseAdapter
from superfunctions.db import Direction, Operator, OrderBy, WhereClause

from .config import get_plugin_config, normalize_config
from .http import authenticate_request, create_authfn_openapi, create_authfn_routes
from .plugins.api_keys import ApiKeyPluginConfig, ApiKeyService
from .schema import get_schema
from .types import (
    ApiKeyCreate,
    ApiKeyResponse,
    ApiKeySanitized,
    AuthFnConfig,
    AuthFnSession,
    InvalidCredentialsError,
    Request,
)


def generate_api_key(prefix: str = "ak") -> str:
    """Generate a secure API key."""
    random_bytes = secrets.token_bytes(32)
    key = random_bytes.hex()
    return f"{prefix}_{key}"


def generate_id(prefix: str) -> str:
    """Generate unique ID."""
    timestamp = format(int(time.time() * 1000), "x")
    random_str = secrets.token_hex(5)[:7]
    return f"{prefix}_{timestamp}{random_str}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuthFnProvider:
    """Auth provider implementation for authfn."""

    def __init__(self, database: DatabaseAdapter, namespace: str = "authfn", config: Optional[AuthFnConfig] = None):
        self.database = database
        self.namespace = namespace
        self.config = config

    async def authenticate(self, request: Request) -> Optional[AuthFnSession]:
        """Authenticate a request and return session."""
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        if self.config is not None:
            modern_session = await authenticate_request(self.config, request)
            if modern_session is not None:
                return modern_session
            if auth_header:
                raise InvalidCredentialsError("Invalid API key")
            return None

        if not auth_header:
            return None
        raise InvalidCredentialsError("Invalid API key")

    async def authorize(self, session: AuthFnSession, resource_id: str) -> bool:
        """Authorize a session to access a resource."""
        resource_ids = getattr(session, "resource_ids", None) or []
        return resource_id in resource_ids

    async def revoke(self, session_id: str) -> None:
        """Revoke a session."""
        await self.database.update(
            model="sessions",
            where=[WhereClause(field="id", operator=Operator.EQ, value=session_id)],
            data={"revokedAt": _utcnow()},
            namespace=self.namespace,
        )
        await self.database.update(
            model="api_keys",
            where=[WhereClause(field="id", operator=Operator.EQ, value=session_id)],
            data={
                "revokedAt": _utcnow(),
                "updatedAt": _utcnow(),
            },
            namespace=self.namespace,
        )


class AuthFn:
    """AuthFn instance with provider and key management."""

    def __init__(self, config: AuthFnConfig):
        """Initialize AuthFn instance."""
        self.config = normalize_config(config)
        self.database = self.config.database
        self.namespace = self.config.namespace
        self._provider = AuthFnProvider(self.database, self.namespace, self.config)
        self.routes = create_authfn_routes(self.config)
        self.router = self.routes

    @property
    def provider(self) -> AuthFnProvider:
        """Get the auth provider."""
        return self._provider

    def get_routes(self) -> Any:
        """Return authfn HTTP routes."""
        return self.router

    def get_schema(self) -> Any:
        """Return the deterministic authfn schema."""
        return get_schema(self.config)

    def open_api(self) -> Any:
        """Return the authfn OpenAPI document."""
        return create_authfn_openapi(self.config)

    async def create_key(self, data: ApiKeyCreate) -> ApiKeyResponse:
        """Create a new API key."""
        plugin_config = get_plugin_config(self.config, "apiKey", ApiKeyPluginConfig())
        created = await ApiKeyService(
            self.config,
            plugin_config,
        ).create_key(
            user_id=None,
            name=data.name,
            scopes=data.scopes,
            metadata=data.metadata,
            expires_at=data.expires_at,
            resource_ids=data.resource_ids,
        )
        return ApiKeyResponse(id=created["keyId"], key=created["secret"])

    async def revoke_key(self, key_id: str) -> None:
        """Revoke an API key."""
        plugin_config = get_plugin_config(self.config, "apiKey", ApiKeyPluginConfig())
        await ApiKeyService(self.config, plugin_config).revoke_key(key_id=key_id)

    async def get_key(self, key_id: str) -> Optional[ApiKeySanitized]:
        """Get API key by ID (without the secret key)."""
        key_data = await self.database.find_one(
            model="api_keys",
            where=[WhereClause(field="id", operator=Operator.EQ, value=key_id)],
            namespace=self.namespace,
        )

        if not key_data:
            return None

        metadata = dict(key_data.get("metadata") or {})
        resource_ids = list(metadata.pop("resourceIds", []) or [])
        return ApiKeySanitized(
            id=key_data["id"],
            name=key_data.get("name"),
            resourceIds=resource_ids,
            scopes=key_data.get("scopes"),
            metadata=metadata or None,
            expiresAt=key_data.get("expiresAt"),
            lastUsedAt=key_data.get("lastUsedAt"),
            revokedAt=key_data.get("revokedAt"),
            createdAt=key_data.get("createdAt"),
        )

    async def list_keys(
        self, filters: Optional[Dict[str, Any]] = None
    ) -> List[ApiKeySanitized]:
        """List API keys (without the secret keys)."""
        keys_data = await self.database.find_many(
            model="api_keys",
            where=[],
            order_by=[OrderBy(field="createdAt", direction=Direction.DESC)],
            namespace=self.namespace,
        )
        sanitized_keys = []
        resource_filter = filters.get("resourceId") if filters else None
        for key_data in keys_data:
            metadata = dict(key_data.get("metadata") or {})
            resource_ids = list(metadata.pop("resourceIds", []) or [])
            if resource_filter and resource_filter not in resource_ids:
                continue
            sanitized_keys.append(
                ApiKeySanitized(
                    id=key_data["id"],
                    name=key_data.get("name"),
                    resourceIds=resource_ids,
                    scopes=key_data.get("scopes"),
                    metadata=metadata or None,
                    expiresAt=key_data.get("expiresAt"),
                    lastUsedAt=key_data.get("lastUsedAt"),
                    revokedAt=key_data.get("revokedAt"),
                    createdAt=key_data.get("createdAt"),
                )
            )

        return sanitized_keys


def create_authfn(config: AuthFnConfig) -> AuthFn:
    """Create authfn instance."""
    return AuthFn(config)
