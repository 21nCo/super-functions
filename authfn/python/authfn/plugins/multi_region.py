"""Multi-region plugin and service for authfn Python."""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from ..types import (
    AuthFnConfig,
    AuthFnPlugin,
    AuthFnRuntimeResolution,
    RegionMismatchError,
    RegionNotFoundError,
    ValidationError,
)


@dataclass
class MultiRegionRegionConfig:
    region_id: str
    authority: str
    domain: Optional[str] = None
    hosts: List[str] = field(default_factory=list)
    issuer: Optional[str] = None
    base_url: Optional[str] = None
    cookie: Optional[Dict[str, Any]] = None
    oauth: Optional[Dict[str, Dict[str, Any]]] = None


@dataclass
class MultiRegionPluginConfig:
    regions: List[MultiRegionRegionConfig] = field(default_factory=list)
    default_region_id: Optional[str] = None
    directory: Optional[Any] = None


class MultiRegionService:
    def __init__(self, config: AuthFnConfig, plugin_config: Optional[MultiRegionPluginConfig] = None):
        self.config = config
        self.plugin_config = plugin_config or MultiRegionPluginConfig()

    def resolve_runtime(self, request: Any) -> AuthFnRuntimeResolution:
        base_runtime = self._base_runtime(request)
        region = self._resolve_region(request, base_runtime)
        if region is None:
            return base_runtime
        cookie = dict(base_runtime.cookie.model_dump(by_alias=True) if base_runtime.cookie else {})
        cookie.update(region.cookie or {})
        if region.domain and cookie.get("domain") is None:
            cookie["domain"] = region.domain
        oauth = dict(base_runtime.oauth or {})
        for provider, values in (region.oauth or {}).items():
            oauth[provider] = {**oauth.get(provider, {}), **values}
        return AuthFnRuntimeResolution.model_validate(
            {
                "issuer": region.issuer or region.authority,
                "baseUrl": region.base_url or region.authority,
                "regionId": region.region_id,
                "cookie": cookie or None,
                "oauth": oauth or None,
            }
        )

    async def register_user(
        self,
        *,
        user_id: str,
        primary_email: Optional[str],
        request: Optional[Any] = None,
        runtime: Optional[AuthFnRuntimeResolution] = None,
    ) -> Optional[Dict[str, Any]]:
        resolved_runtime = runtime or self.resolve_runtime(request or _default_request())
        region = self._resolve_region(request or _default_request(), resolved_runtime)
        region_id = (region.region_id if region else resolved_runtime.region_id) or self.plugin_config.default_region_id
        authority = (region.authority if region else resolved_runtime.base_url) if resolved_runtime.base_url else None
        if not region_id or not authority:
            return None
        now = datetime.now(timezone.utc)
        existing = await self.config.database.find_one(
            model="region_profiles",
            where=[{"field": "userId", "operator": "eq", "value": user_id}],
            namespace=self.config.namespace,
        )
        payload = {
            "id": existing["id"] if existing else _create_id("region"),
            "userId": user_id,
            "regionId": region_id,
            "authority": authority,
            "domain": region.domain if region else None,
            "createdAt": existing["createdAt"] if existing else now,
            "updatedAt": now,
        }
        if existing is None:
            await self.config.database.create(
                model="region_profiles",
                data=payload,
                namespace=self.config.namespace,
            )
        else:
            await self.config.database.update(
                model="region_profiles",
                where=[{"field": "id", "operator": "eq", "value": existing["id"]}],
                data={
                    "regionId": payload["regionId"],
                    "authority": payload["authority"],
                    "domain": payload["domain"],
                    "updatedAt": now,
                },
                namespace=self.config.namespace,
            )
        register = getattr(self.plugin_config.directory, "register_user", None)
        if register:
            await _maybe_await(
                register(
                    {
                        "userId": user_id,
                        "primaryEmail": primary_email,
                        "regionId": payload["regionId"],
                        "authority": payload["authority"],
                        "domain": payload["domain"],
                    }
                )
            )
        return payload

    async def lookup(self, *, identifier: str, request: Optional[Any] = None) -> Dict[str, Any]:
        normalized = _normalize_identifier(identifier)
        runtime = self.resolve_runtime(request or _default_request())
        located = await self._lookup_record(normalized, request, runtime)
        if located is None:
            raise RegionNotFoundError("Region routing information not found")
        continue_locally = _normalize_authority(runtime.base_url) == _normalize_authority(located["authority"])
        return {
            "identifier": normalized,
            "userId": located.get("userId"),
            "regionId": located["regionId"],
            "authority": _normalize_authority(located["authority"]),
            "domain": located.get("domain"),
            "continueLocally": continue_locally,
            "redirectTo": None if continue_locally else _normalize_authority(located["authority"]),
        }

    async def ensure_region_alignment(self, *, user_id: str, request: Optional[Any] = None) -> Dict[str, Any]:
        runtime = self.resolve_runtime(request or _default_request())
        user = await self.config.database.find_one(
            model="users",
            where=[{"field": "id", "operator": "eq", "value": user_id}],
            namespace=self.config.namespace,
        )
        email = user.get("primaryEmail") if user else None
        if not email:
            return {"regionId": runtime.region_id}
        located = await self._lookup_record(_normalize_identifier(email), request, runtime)
        if located is None:
            return {"regionId": runtime.region_id}
        current = _normalize_authority(runtime.base_url)
        target = _normalize_authority(located["authority"])
        if current != target:
            raise RegionMismatchError(
                "Request must continue on a different region authority",
                {
                    "userId": user_id,
                    "regionId": located["regionId"],
                    "authority": target,
                    "redirectTo": target,
                    "continueLocally": False,
                },
            )
        return {"regionId": located["regionId"]}

    async def _lookup_record(
        self,
        identifier: str,
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
    ) -> Optional[Dict[str, Any]]:
        lookup = getattr(self.plugin_config.directory, "lookup_by_identifier", None)
        if lookup:
            found = await _maybe_await(
                lookup(
                    {
                        "identifier": identifier,
                        "request": request,
                        "runtime": runtime,
                    }
                )
            )
            if found:
                return dict(found)
        user = await self.config.database.find_one(
            model="users",
            where=[{"field": "primaryEmail", "operator": "eq", "value": identifier}],
            namespace=self.config.namespace,
        )
        if user is None:
            return None
        profile = await self.config.database.find_one(
            model="region_profiles",
            where=[{"field": "userId", "operator": "eq", "value": user["id"]}],
            namespace=self.config.namespace,
        )
        if profile is None:
            return None
        return {
            "userId": user["id"],
            "regionId": profile["regionId"],
            "authority": profile["authority"],
            "domain": profile.get("domain"),
        }

    def _base_runtime(self, request: Any) -> AuthFnRuntimeResolution:
        if self.config.runtime is not None:
            if hasattr(self.config.runtime, "resolve"):
                runtime = self.config.runtime.resolve(request)
            else:
                runtime = self.config.runtime(request)
            return _coerce_runtime(runtime)
        origin = _request_origin(request)
        return AuthFnRuntimeResolution.model_validate({"issuer": origin, "baseUrl": origin})

    def _resolve_region(
        self,
        request: Any,
        runtime: AuthFnRuntimeResolution,
    ) -> Optional[MultiRegionRegionConfig]:
        host = urlparse(getattr(request, "url", "https://account.example.com")).hostname or "account.example.com"
        host = host.lower()
        for region in self.plugin_config.regions:
            candidates = [*(region.hosts or []), _authority_host(region.authority)]
            if region.domain:
                candidates.append(region.domain)
            normalized = [candidate.lower().lstrip(".") for candidate in candidates if candidate]
            if any(host == candidate or host.endswith(f".{candidate}") for candidate in normalized):
                return region
        if runtime.region_id:
            for region in self.plugin_config.regions:
                if region.region_id == runtime.region_id:
                    return region
        if self.plugin_config.default_region_id:
            for region in self.plugin_config.regions:
                if region.region_id == self.plugin_config.default_region_id:
                    return region
        return None


def authfn_multi_region_plugin(config: Optional[MultiRegionPluginConfig] = None) -> AuthFnPlugin:
    resolved = config or MultiRegionPluginConfig()
    plugin = AuthFnPlugin(
        name="multiRegion",
        schema_factory=lambda _cfg: [
            {
                "modelName": "region_profiles",
                "fields": {
                    "id": {"type": "string", "required": True, "fieldName": "id"},
                    "userId": {"type": "string", "required": True, "fieldName": "user_id"},
                    "regionId": {"type": "string", "required": True, "fieldName": "region_id"},
                    "authority": {"type": "string", "required": True, "fieldName": "authority"},
                    "domain": {"type": "string", "required": False, "fieldName": "domain"},
                    "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                    "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
                },
                "indexes": [
                    {"name": "idx_authfn_region_profiles_region_id", "fields": ["regionId"]},
                    {
                        "name": "idx_authfn_region_profiles_user_id",
                        "fields": ["userId"],
                        "unique": True,
                    },
                ],
            }
        ],
        routes_factory=lambda _ctx: [
            {"method": "POST", "path": "/regions/lookup"},
            {"method": "GET", "path": "/runtime"},
        ],
    )
    plugin._authfn_config = resolved
    return plugin


def _coerce_runtime(value: Any) -> AuthFnRuntimeResolution:
    if isinstance(value, AuthFnRuntimeResolution):
        return value
    if isinstance(value, dict):
        return AuthFnRuntimeResolution.model_validate(value)
    base_url = getattr(value, "baseUrl", None)
    if base_url is None:
        base_url = getattr(value, "base_url", None)
    region_id = getattr(value, "regionId", None)
    if region_id is None:
        region_id = getattr(value, "region_id", None)
    return AuthFnRuntimeResolution.model_validate(
        {
            "issuer": value.issuer,
            "baseUrl": base_url,
            "regionId": region_id,
            "cookie": getattr(value, "cookie", None),
            "oauth": getattr(value, "oauth", None),
        }
    )


async def _maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return await value
    return value


def _request_origin(request: Any) -> str:
    parsed = urlparse(getattr(request, "url", "https://account.example.com"))
    return f"{parsed.scheme}://{parsed.netloc}"


def _authority_host(authority: str) -> str:
    return urlparse(authority).hostname or ""


def _normalize_authority(authority: str) -> str:
    parsed = urlparse(authority)
    if not parsed.scheme or not parsed.netloc:
        raise ValidationError("A valid region authority is required")
    return f"{parsed.scheme}://{parsed.netloc}"


def _normalize_identifier(identifier: str) -> str:
    normalized = identifier.strip().lower()
    if not normalized or "@" not in normalized:
        raise ValidationError("A valid identifier is required")
    return normalized


def _create_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _default_request() -> Any:
    return type("Request", (), {"url": "https://account.example.com", "headers": {}})()


__all__ = [
    "MultiRegionPluginConfig",
    "MultiRegionRegionConfig",
    "MultiRegionService",
    "authfn_multi_region_plugin",
]
