"""API key plugin and service for authfn Python."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..types import (
    ApiKeyRevokedError,
    AuthFnConfig,
    AuthFnPlugin,
    AuthFnSession,
    ExpiredCredentialsError,
    ValidationError,
)


def _default_now() -> datetime:
    return datetime.now(timezone.utc)


def _create_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _read_authorization_secret(request: Any) -> Optional[str]:
    headers = getattr(request, "headers", {}) or {}
    authorization = headers.get("authorization") or headers.get("Authorization")
    if not authorization:
        return None
    value = authorization.strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip() or None
    if value.lower().startswith("api-key "):
        return value[8:].strip() or None
    return None


def _assert_valid_name(name: str) -> None:
    if not name:
        raise ValidationError("API key name is required")
    length = len(name.encode("utf-8"))
    if length > 128:
        raise ValidationError("API key name must be 128 UTF-8 bytes or fewer")


@dataclass
class ApiKeyPluginConfig:
    now: Any = _default_now
    secret_prefix: str = "ak"


class ApiKeyService:
    def __init__(self, config: AuthFnConfig, plugin_config: Optional[ApiKeyPluginConfig] = None):
        self.config = config
        self.plugin_config = plugin_config or ApiKeyPluginConfig()

    async def create_key(
        self,
        *,
        user_id: Optional[str] = None,
        name: str,
        scopes: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        expires_at: Optional[datetime] = None,
        resource_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        _assert_valid_name(name)

        stored_metadata = dict(metadata or {})
        if resource_ids is not None:
            stored_metadata.setdefault("resourceIds", list(resource_ids))

        secret = f"{self.plugin_config.secret_prefix}_{secrets.token_urlsafe(24)}"
        now = self.plugin_config.now()
        normalized_expires_at = _as_utc(expires_at)
        record = {
            "id": _create_id("key"),
            "userId": user_id,
            "name": name,
            "secretHash": _hash_secret(secret),
            "scopes": list(scopes or []),
            "metadata": stored_metadata,
            "expiresAt": normalized_expires_at,
            "revokedAt": None,
            "lastUsedAt": None,
            "createdAt": now,
            "updatedAt": now,
        }
        await self.config.database.create(
            model="api_keys",
            data=record,
            namespace=self.config.namespace,
        )
        return {"keyId": record["id"], "secret": secret, "record": record}

    async def list_keys(self, *, user_id: str) -> List[Dict[str, Any]]:
        rows = await self.config.database.find_many(
            model="api_keys",
            where=[{"field": "userId", "operator": "eq", "value": user_id}],
            order_by=[{"field": "createdAt", "direction": "asc"}],
            namespace=self.config.namespace,
        )
        return [self._sanitize(row) for row in rows]

    async def revoke_key(self, *, key_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        key = await self.config.database.find_one(
            model="api_keys",
            where=[{"field": "id", "operator": "eq", "value": key_id}],
            namespace=self.config.namespace,
        )
        if key is None or (user_id is not None and key.get("userId") != user_id):
            raise ValidationError("API key not found")
        if key.get("revokedAt") is not None:
            return key
        now = self.plugin_config.now()
        return await self.config.database.update(
            model="api_keys",
            where=[{"field": "id", "operator": "eq", "value": key_id}],
            data={"revokedAt": now, "updatedAt": now},
            namespace=self.config.namespace,
        )

    async def authenticate(self, request: Any) -> Optional[AuthFnSession]:
        secret = _read_authorization_secret(request)
        if secret is None:
            return None
        row = await self.config.database.find_one(
            model="api_keys",
            where=[{"field": "secretHash", "operator": "eq", "value": _hash_secret(secret)}],
            namespace=self.config.namespace,
        )
        if row is None:
            return None
        if row.get("revokedAt") is not None:
            raise ApiKeyRevokedError("API key has been revoked")
        expires_at = _as_utc(row.get("expiresAt"))
        now = self.plugin_config.now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        else:
            now = now.astimezone(timezone.utc)
        if expires_at is not None and expires_at <= now:
            raise ExpiredCredentialsError("API key has expired")
        await self.config.database.update(
            model="api_keys",
            where=[{"field": "id", "operator": "eq", "value": row["id"]}],
            data={"lastUsedAt": now, "updatedAt": now},
            namespace=self.config.namespace,
        )
        metadata = dict(row.get("metadata") or {})
        return AuthFnSession.model_validate(
            {
                "id": row["id"],
                "type": "api-key",
                "actorType": "api-key",
                "actorId": row["id"],
                "resourceIds": metadata.get("resourceIds"),
                "methods": ["api-key"],
                "expiresAt": expires_at,
                "metadata": {
                    "ownerUserId": row.get("userId"),
                    "scopes": row.get("scopes") or [],
                    **metadata,
                },
            }
        )

    def _sanitize(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "userId": row.get("userId"),
            "name": row.get("name"),
            "scopes": row.get("scopes"),
            "metadata": row.get("metadata"),
            "expiresAt": row.get("expiresAt"),
            "revokedAt": row.get("revokedAt"),
            "lastUsedAt": row.get("lastUsedAt"),
            "createdAt": row.get("createdAt"),
            "updatedAt": row.get("updatedAt"),
        }


def authfn_api_key_plugin(config: Optional[ApiKeyPluginConfig] = None) -> AuthFnPlugin:
    resolved = config or ApiKeyPluginConfig()
    plugin = AuthFnPlugin(
        name="apiKey",
        schema_factory=lambda _cfg: [
            {
                "modelName": "api_keys",
                "fields": {
                    "id": {"type": "string", "required": True, "fieldName": "id"},
                    "userId": {"type": "string", "required": False, "fieldName": "user_id"},
                    "name": {"type": "string", "required": False, "fieldName": "name"},
                    "secretHash": {
                        "type": "string",
                        "required": True,
                        "fieldName": "secret_hash",
                    },
                    "scopes": {"type": "json", "required": False, "fieldName": "scopes"},
                    "metadata": {"type": "json", "required": False, "fieldName": "metadata"},
                    "expiresAt": {"type": "date", "required": False, "fieldName": "expires_at"},
                    "revokedAt": {"type": "date", "required": False, "fieldName": "revoked_at"},
                    "lastUsedAt": {"type": "date", "required": False, "fieldName": "last_used_at"},
                    "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                    "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
                },
                "indexes": [
                    {"name": "idx_authfn_api_keys_secret_hash", "fields": ["secretHash"]},
                    {
                        "name": "idx_authfn_api_keys_user_id_created_at",
                        "fields": ["userId", "createdAt"],
                    },
                ],
            }
        ],
        routes_factory=lambda _ctx: [
            {"method": "POST", "path": "/api-keys"},
            {"method": "GET", "path": "/api-keys"},
            {"method": "DELETE", "path": "/api-keys/:keyId"},
        ],
    )
    plugin._authfn_config = resolved
    return plugin


__all__ = [
    "ApiKeyPluginConfig",
    "ApiKeyService",
    "authfn_api_key_plugin",
]
