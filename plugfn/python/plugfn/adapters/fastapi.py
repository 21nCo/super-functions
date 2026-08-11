"""FastAPI adapter for PlugFn."""

from typing import Any, Optional

try:
    from fastapi import APIRouter, Request
    from fastapi.responses import JSONResponse
except ImportError:
    raise ImportError(
        "FastAPI is required for this adapter. Install it with: pip install plugfn[fastapi]"
    ) from None

from ._shared import (
    AdapterSecurityError,
    assert_identity_match,
    error_payload,
    normalize_headers,
    normalize_scopes,
    resolve_principal,
    resolve_webhook_secret,
    success_payload,
)


def mount_plugfn(
    app: Any,
    plug: Any,
    prefix: str = "/api/plugfn",
    auth: Optional[Any] = None,
) -> APIRouter:
    """Mount PlugFn routes to a FastAPI app."""
    router = APIRouter(prefix=prefix, tags=["plugfn"])

    @router.post("/connections/auth")
    async def create_connection_auth(request: Request) -> JSONResponse:
        return await _handle_auth_url_request(request, plug, auth)

    @router.get("/auth/{provider}")
    async def legacy_get_auth_url(provider: str, request: Request) -> JSONResponse:
        return await _handle_auth_url_request(request, plug, auth, provider_override=provider)

    @router.get("/callback")
    async def canonical_callback(
        code: str, state: str, provider: Optional[str] = None
    ) -> JSONResponse:
        return await _handle_callback(provider, code, state, plug)

    @router.get("/auth/{provider}/callback")
    async def legacy_callback(provider: str, code: str, state: str) -> JSONResponse:
        return await _handle_callback(provider, code, state, plug)

    @router.get("/connections")
    async def list_connections(
        request: Request, provider: Optional[str] = None
    ) -> JSONResponse:
        try:
            principal = await resolve_principal(request, plug, auth)
            requested_user_id = _request_value(request, "user_id") or _request_value(request, "userId")
            assert_identity_match(principal, requested_user_id)
            connections = await plug.connections.list(user_id=principal["user_id"], provider=provider)
            return _success({"userId": principal["user_id"], "connections": [_connection_json(item) for item in connections]})
        except Exception as error:
            return _error_from_exception(error)

    @router.post("/connections/disconnect")
    async def disconnect_connection(request: Request) -> JSONResponse:
        try:
            payload = await _read_json_body(request)
            principal = await resolve_principal(request, plug, auth)
            assert_identity_match(principal, payload.get("user_id") or payload.get("userId"))
            connection_id = payload.get("connection_id") or payload.get("connectionId")
            if not isinstance(connection_id, str) or not connection_id:
                raise AdapterSecurityError("VALIDATION_ERROR", "connection_id is required", 400)
            await plug.connections.disconnect(connection_id=connection_id, user_id=principal["user_id"])
            return _success({"connectionId": connection_id, "disconnected": True})
        except Exception as error:
            return _error_from_exception(error)

    @router.delete("/connections/{connection_id}")
    async def legacy_disconnect(connection_id: str, request: Request) -> JSONResponse:
        try:
            principal = await resolve_principal(request, plug, auth)
            await plug.connections.disconnect(connection_id=connection_id, user_id=principal["user_id"])
            return _success({"connectionId": connection_id, "disconnected": True})
        except Exception as error:
            return _error_from_exception(error)

    @router.post("/webhooks/{provider}/{event}")
    async def handle_webhook(
        provider: str, event: str, request: Request
    ) -> JSONResponse:
        try:
            raw_body = await request.body()
            headers = normalize_headers(dict(request.headers))
            secret = resolve_webhook_secret(plug, provider)
            results = await plug._webhook_handler.handle_webhook(
                provider=provider,
                event=event,
                payload=None,
                headers=headers,
                secret=secret,
                raw_body=raw_body,
            )
            return _success({"results": results})
        except Exception as error:
            return _error_from_exception(error)

    @router.get("/providers")
    async def list_providers(request: Request) -> JSONResponse:
        try:
            await resolve_principal(request, plug, auth)
            providers = plug.providers.list()
            return _success({"providers": [_provider_json(provider) for provider in providers]})
        except Exception as error:
            return _error_from_exception(error)

    app.include_router(router)
    return router


async def _handle_auth_url_request(
    request: Request,
    plug: Any,
    auth_override: Optional[Any],
    provider_override: Optional[str] = None,
) -> JSONResponse:
    try:
        if request.method == "POST":
            payload = await _read_json_body(request)
            provider = provider_override or payload.get("provider")
            redirect_uri = payload.get("redirect_uri") or payload.get("redirectUri")
            scopes_value = payload.get("scopes")
            requested_user_id = payload.get("user_id") or payload.get("userId")
            connection_name = payload.get("connection_name") or payload.get("connectionName")
        else:
            provider = provider_override or _request_value(request, "provider")
            redirect_uri = _request_value(request, "redirect_uri")
            scopes_value = _request_value(request, "scopes")
            requested_user_id = _request_value(request, "user_id") or _request_value(request, "userId")
            connection_name = _request_value(request, "connection_name") or _request_value(request, "connectionName")

        if not isinstance(provider, str) or not provider:
            raise AdapterSecurityError("VALIDATION_ERROR", "provider is required", 400)
        if not isinstance(redirect_uri, str) or not redirect_uri:
            raise AdapterSecurityError("VALIDATION_ERROR", "redirect_uri is required", 400)

        principal = await resolve_principal(request, plug, auth_override)
        assert_identity_match(principal, requested_user_id)
        url = await plug.connections.get_auth_url(
            provider=provider,
            user_id=principal["user_id"],
            redirect_uri=redirect_uri,
            scopes=normalize_scopes(scopes_value),
            connection_name=connection_name,
        )
        return _success({"url": url, "userId": principal["user_id"]})
    except Exception as error:
        return _error_from_exception(error)


async def _handle_callback(
    provider: Optional[str], code: str, state: str, plug: Any
) -> JSONResponse:
    try:
        connection = await plug.connections.handle_callback(provider=provider, code=code, state=state)
        return _success({"connection": {"id": connection.id, "provider": connection.provider, "status": connection.status}})
    except Exception as error:
        return _error_from_exception(error)


async def _read_json_body(request: Request) -> dict[str, Any]:
    payload = await request.json()
    if not isinstance(payload, dict):
        raise AdapterSecurityError("VALIDATION_ERROR", "JSON body must be an object", 400)
    return payload


def _request_value(request: Request, key: str) -> Optional[str]:
    value = request.query_params.get(key)
    return value if isinstance(value, str) else None


def _connection_json(connection: Any) -> dict[str, Any]:
    connected_at = getattr(connection, "connected_at", None)
    return {
        "id": connection.id,
        "provider": connection.provider,
        "name": connection.name,
        "status": connection.status,
        "connected_at": connected_at.isoformat() if connected_at else None,
    }


def _provider_json(provider: Any) -> dict[str, Any]:
    return {
        "name": provider.name,
        "display_name": provider.display_name,
        "description": provider.description,
        "auth_type": provider.auth_type,
        "version": provider.version,
    }


def _success(data: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return JSONResponse(success_payload(data), status_code=status_code)


def _error_from_exception(error: Exception) -> JSONResponse:
    payload, status_code = error_payload(error)
    return JSONResponse(payload, status_code=status_code)
