"""Flask adapter for PlugFn."""

import asyncio
from typing import Any, Optional

try:
    from flask import Blueprint, jsonify, request
except ImportError:
    raise ImportError(
        "Flask is required for this adapter. Install it with: pip install plugfn[flask]"
    )

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
) -> Blueprint:
    """Mount PlugFn routes to a Flask app."""
    bp = Blueprint("plugfn", __name__, url_prefix=prefix)

    def run_async(coro: Any) -> Any:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

    @bp.route("/connections/auth", methods=["POST"])
    def create_connection_auth():
        return run_async(_handle_auth_url_request(plug, auth))

    @bp.route("/auth/<provider>", methods=["GET"])
    def legacy_get_auth_url(provider: str):
        return run_async(_handle_auth_url_request(plug, auth, provider_override=provider))

    @bp.route("/callback", methods=["GET"])
    def canonical_callback():
        return run_async(_handle_callback(request.values.get("provider"), request.values.get("code"), request.values.get("state"), plug))

    @bp.route("/auth/<provider>/callback", methods=["GET"])
    def legacy_callback(provider: str):
        return run_async(_handle_callback(provider, request.values.get("code"), request.values.get("state"), plug))

    @bp.route("/connections", methods=["GET"])
    def list_connections():
        try:
            provider = request.values.get("provider")
            principal = run_async(resolve_principal(request, plug, auth))
            assert_identity_match(principal, request.values.get("user_id") or request.values.get("userId"))
            connections = run_async(plug.connections.list(user_id=principal["user_id"], provider=provider))
            return _success({"userId": principal["user_id"], "connections": [_connection_json(item) for item in connections]})
        except Exception as error:
            return _error_from_exception(error)

    @bp.route("/connections/disconnect", methods=["POST"])
    def disconnect_connection():
        try:
            payload = request.get_json(silent=False)
            if not isinstance(payload, dict):
                raise AdapterSecurityError("VALIDATION_ERROR", "JSON body must be an object", 400)
            principal = run_async(resolve_principal(request, plug, auth))
            assert_identity_match(principal, payload.get("user_id") or payload.get("userId"))
            connection_id = payload.get("connection_id") or payload.get("connectionId")
            if not isinstance(connection_id, str) or not connection_id:
                raise AdapterSecurityError("VALIDATION_ERROR", "connection_id is required", 400)
            run_async(plug.connections.disconnect(connection_id=connection_id, user_id=principal["user_id"]))
            return _success({"connectionId": connection_id, "disconnected": True})
        except Exception as error:
            return _error_from_exception(error)

    @bp.route("/connections/<connection_id>", methods=["DELETE"])
    def legacy_disconnect(connection_id: str):
        try:
            principal = run_async(resolve_principal(request, plug, auth))
            run_async(plug.connections.disconnect(connection_id=connection_id, user_id=principal["user_id"]))
            return _success({"connectionId": connection_id, "disconnected": True})
        except Exception as error:
            return _error_from_exception(error)

    @bp.route("/webhooks/<provider>/<event>", methods=["POST"])
    def handle_webhook(provider: str, event: str):
        try:
            raw_body = request.get_data(cache=True, as_text=False)
            headers = normalize_headers(dict(request.headers))
            secret = resolve_webhook_secret(plug, provider)
            results = run_async(
                plug._webhook_handler.handle_webhook(
                    provider=provider,
                    event=event,
                    payload=None,
                    headers=headers,
                    secret=secret,
                    raw_body=raw_body,
                )
            )
            return _success({"results": results})
        except Exception as error:
            return _error_from_exception(error)

    @bp.route("/providers", methods=["GET"])
    def list_providers():
        try:
            run_async(resolve_principal(request, plug, auth))
            providers = plug.providers.list()
            return _success({"providers": [_provider_json(provider) for provider in providers]})
        except Exception as error:
            return _error_from_exception(error)

    app.register_blueprint(bp)
    return bp


async def _handle_auth_url_request(
    plug: Any,
    auth_override: Optional[Any],
    provider_override: Optional[str] = None,
):
    try:
        if request.method == "POST":
            payload = request.get_json(silent=False)
            if not isinstance(payload, dict):
                raise AdapterSecurityError("VALIDATION_ERROR", "JSON body must be an object", 400)
            provider = provider_override or payload.get("provider")
            redirect_uri = payload.get("redirect_uri") or payload.get("redirectUri")
            scopes_value = payload.get("scopes")
            requested_user_id = payload.get("user_id") or payload.get("userId")
            connection_name = payload.get("connection_name") or payload.get("connectionName")
        else:
            provider = provider_override or request.values.get("provider")
            redirect_uri = request.values.get("redirect_uri")
            scopes_value = request.values.get("scopes")
            requested_user_id = request.values.get("user_id") or request.values.get("userId")
            connection_name = request.values.get("connection_name") or request.values.get("connectionName")

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


async def _handle_callback(provider: Any, code: Any, state: Any, plug: Any):
    try:
        if not isinstance(provider, str) or not provider:
            raise AdapterSecurityError("VALIDATION_ERROR", "provider is required", 400)
        if not isinstance(code, str) or not code or not isinstance(state, str) or not state:
            raise AdapterSecurityError("VALIDATION_ERROR", "code and state are required", 400)
        connection = await plug.connections.handle_callback(provider=provider, code=code, state=state)
        return _success({"connection": {"id": connection.id, "provider": connection.provider, "status": connection.status}})
    except Exception as error:
        return _error_from_exception(error)


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


def _success(data: dict[str, Any], status_code: int = 200):
    return jsonify(success_payload(data)), status_code


def _error_from_exception(error: Exception):
    payload, status_code = error_payload(error)
    return jsonify(payload), status_code
