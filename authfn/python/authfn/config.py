"""Shared config helpers for the Python authfn surface."""

from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlparse

from .types import AuthFnConfig, AuthFnPlugin, AuthFnRuntimeResolution


def normalize_config(value: AuthFnConfig | dict[str, Any]) -> AuthFnConfig:
    """Validate and normalize authfn config input."""

    if isinstance(value, AuthFnConfig):
        return value
    return AuthFnConfig.model_validate(value)


def get_plugin(config: AuthFnConfig, name: str) -> Optional[AuthFnPlugin]:
    """Return the first configured plugin by public plugin name."""

    for plugin in config.plugins:
        if plugin.name == name:
            return plugin
    return None


def get_plugin_config(config: AuthFnConfig, name: str, default: Any = None) -> Any:
    """Return the captured plugin config for a configured plugin."""

    plugin = get_plugin(config, name)
    if plugin is None:
        return default
    return getattr(plugin, "_authfn_config", default)


def resolve_runtime(config: AuthFnConfig, request: Any = None) -> AuthFnRuntimeResolution:
    """Resolve request-aware runtime configuration with multi-region precedence."""

    multi_region_plugin = get_plugin(config, "multiRegion")
    if multi_region_plugin is not None:
        from .plugins.multi_region import MultiRegionPluginConfig, MultiRegionService

        plugin_config = get_plugin_config(config, "multiRegion", MultiRegionPluginConfig())
        return MultiRegionService(config, plugin_config).resolve_runtime(request)

    runtime = config.runtime
    if runtime is None:
        return _default_runtime(request)
    if hasattr(runtime, "resolve"):
        resolved = runtime.resolve(request)
    elif callable(runtime):
        resolved = runtime(request)
    else:
        resolved = runtime
    return _coerce_runtime(resolved)


def _default_runtime(request: Any = None) -> AuthFnRuntimeResolution:
    url = getattr(request, "url", "https://account.example.com/auth")
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return AuthFnRuntimeResolution.model_validate(
            {
                "issuer": "https://account.example.com",
                "baseUrl": "https://account.example.com",
                "oauth": {},
            }
        )

    origin = f"{parsed.scheme}://{parsed.netloc}"
    return AuthFnRuntimeResolution.model_validate(
        {
            "issuer": origin,
            "baseUrl": origin,
            "oauth": {},
        }
    )


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


__all__ = [
    "AuthFnConfig",
    "AuthFnRuntimeResolution",
    "get_plugin",
    "get_plugin_config",
    "normalize_config",
    "resolve_runtime",
]
