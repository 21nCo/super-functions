"""Social OAuth plugin and service for authfn Python."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, cast
from urllib.parse import urlencode

from cryptography.fernet import Fernet
from superfunctions.oauth import (
    OAuthBrowserAuthSubject,
    OAuthFlowDisconnectInput,
    OAuthFlowEvent,
    OAuthFlowIdentityHooks,
    OAuthFlowResolvedIdentity,
    OAuthFlowService,
    OAuthFlowServiceConfig,
    OAuthFlowStartInput,
    OAuthHttpError,
    OAuthProviderDescriptor,
    OAuthProviderRuntimeConfig,
    OAuthResolvedClientSecret,
    OAuthRevocationRequest,
    OAuthSecretResolverContext,
    OAuthStateRecord,
    OAuthTokenEndpointRequest,
    OAuthTokenEndpointResponse,
    TokenRecord,
    apply_subject_to_state_record,
    create_oauth_flow_service,
    get_oauth_subject_key,
    normalize_oauth_error_body,
    resolve_oauth_stored_subject,
    secret_resolution_failed_error,
    unsupported_token_auth_method_error,
)

from ..config import get_plugin, get_plugin_config, resolve_runtime
from ..errors import to_authfn_error
from ..observability import emit_auth_event, event_request_id
from ..types import (
    AuthFnConfig,
    AuthFnError,
    AuthFnHookContext,
    AuthFnPlugin,
    AuthFnRuntimeResolution,
    OAuthCallbackInvalidError,
    OAuthProviderUnsupportedError,
    OAuthStateInvalidError,
    OAuthStateReplayedError,
    PluginAbortedError,
    RedirectUriDisallowedError,
    TableSchema,
    ValidationError,
)

SOCIAL_PROVIDER_IDS = ("google", "apple", "github")
DEFAULT_STATE_TTL_SECONDS = 600


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class SocialProviderConfig:
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    client_secret_resolver: Optional[
        Callable[
            [OAuthSecretResolverContext],
            Awaitable[OAuthResolvedClientSecret] | OAuthResolvedClientSecret,
        ]
    ] = None
    allowlisted_return_to: List[str] = field(default_factory=list)
    allowlisted_redirect_uris: List[str] = field(default_factory=list)
    scopes: List[str] = field(default_factory=list)
    link_by_verified_email: bool = False
    profile_resolver: Optional[
        Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]] | Dict[str, Any]]
    ] = None


@dataclass
class SocialOAuthPluginConfig:
    providers: Dict[str, SocialProviderConfig] = field(default_factory=dict)
    fetcher: Optional[Any] = None
    now: Callable[[], datetime] = _utcnow
    state_ttl_seconds: int = DEFAULT_STATE_TTL_SECONDS
    encryption_key_ref: str = "oauth-default"


class DbOAuthStateStore:
    """Database-backed OAuth state store that follows the shared contract."""

    def __init__(self, config: AuthFnConfig):
        self.config = config

    async def put(self, record: OAuthStateRecord) -> None:
        normalized = apply_subject_to_state_record(record)
        subject = resolve_oauth_stored_subject(normalized)
        await self.config.database.create(
            model="oauth_states",
            data={
                "state_id": normalized.state_id,
                "provider_id": normalized.provider_id,
                "subject_kind": subject.kind,
                "subject_key": get_oauth_subject_key(subject),
                "subject_payload": subject.model_dump(by_alias=True, exclude_none=True),
                "redirect_uri": normalized.redirect_uri,
                "requested_scopes": list(normalized.requested_scopes),
                "code_verifier": normalized.code_verifier,
                "nonce": normalized.nonce,
                "created_at": normalized.created_at,
                "expires_at": normalized.expires_at,
                "consumed_at": normalized.consumed_at,
            },
            namespace=self.config.namespace,
        )

    async def get(self, state_id: str) -> Optional[OAuthStateRecord]:
        row = await self.config.database.find_one(
            model="oauth_states",
            where=[{"field": "state_id", "operator": "eq", "value": state_id}],
            namespace=self.config.namespace,
        )
        if row is None:
            return None
        return _state_from_row(row)

    async def consume(self, state_id: str, consumed_at: str) -> Optional[OAuthStateRecord]:
        row = await self.get(state_id)
        if row is None:
            return None
        if row.consumed_at is not None or row.expires_at <= consumed_at:
            return None

        await self.config.database.update(
            model="oauth_states",
            where=[{"field": "state_id", "operator": "eq", "value": state_id}],
            data={"consumed_at": consumed_at},
            namespace=self.config.namespace,
        )
        row.consumed_at = consumed_at
        return row

    async def delete_expired(self, before: str) -> int:
        return await self.config.database.delete_many(
            model="oauth_states",
            where=[{"field": "expires_at", "operator": "lt", "value": before}],
            namespace=self.config.namespace,
        )


class DbEncryptedTokenVault:
    """Database-backed encrypted OAuth token vault."""

    def __init__(
        self,
        config: AuthFnConfig,
        *,
        default_key_ref: str,
        now: Callable[[], datetime],
    ):
        self.config = config
        self.default_key_ref = default_key_ref
        self.now = now

    async def put(self, record: TokenRecord) -> None:
        normalized = (
            record
            if isinstance(record, TokenRecord)
            else TokenRecord.model_validate(record)
        )
        key_ref = normalized.key_ref or self.default_key_ref
        encrypted_payload = self._cipher(key_ref).encrypt(
            normalized.encrypted_payload.encode("utf-8")
        ).decode("utf-8")
        payload = {
            "token_id": normalized.token_id,
            "tenant_id": normalized.tenant_id,
            "user_id": normalized.user_id,
            "provider_id": normalized.provider_id,
            "connection_id": normalized.connection_id,
            "encrypted_payload": encrypted_payload,
            "key_ref": key_ref,
            "created_at": normalized.created_at,
            "updated_at": normalized.updated_at,
            "expires_at": normalized.expires_at,
        }
        existing = await self.get_by_connection(normalized.connection_id)
        if existing is None:
            await self.config.database.create(
                model="oauth_tokens",
                data=payload,
                namespace=self.config.namespace,
            )
            return

        await self.config.database.update(
            model="oauth_tokens",
            where=[{"field": "connection_id", "operator": "eq", "value": normalized.connection_id}],
            data=payload,
            namespace=self.config.namespace,
        )

    async def get(self, token_id: str) -> Optional[TokenRecord]:
        row = await self.config.database.find_one(
            model="oauth_tokens",
            where=[{"field": "token_id", "operator": "eq", "value": token_id}],
            namespace=self.config.namespace,
        )
        if row is None:
            return None
        return _token_record_from_row(row)

    async def get_by_connection(self, connection_id: str) -> Optional[TokenRecord]:
        row = await self.config.database.find_one(
            model="oauth_tokens",
            where=[{"field": "connection_id", "operator": "eq", "value": connection_id}],
            namespace=self.config.namespace,
        )
        if row is None:
            return None
        return _token_record_from_row(row)

    async def rotate_key(self, token_id: str, new_key_ref: str) -> None:
        row = await self.get(token_id)
        if row is None:
            return
        decrypted = self._cipher(row.key_ref).decrypt(row.encrypted_payload.encode("utf-8"))
        rotated = self._cipher(new_key_ref).encrypt(decrypted).decode("utf-8")
        await self.config.database.update(
            model="oauth_tokens",
            where=[{"field": "token_id", "operator": "eq", "value": token_id}],
            data={
                "encrypted_payload": rotated,
                "key_ref": new_key_ref,
                "updated_at": self.now().isoformat(),
            },
            namespace=self.config.namespace,
        )

    async def delete_by_connection(self, connection_id: str) -> None:
        await self.config.database.delete_many(
            model="oauth_tokens",
            where=[{"field": "connection_id", "operator": "eq", "value": connection_id}],
            namespace=self.config.namespace,
        )

    def _cipher(self, key_ref: str) -> Fernet:
        return Fernet(_derive_fernet_key(self.config.namespace, key_ref))


class FetchOAuthTokenHttpClient:
    """HTTP client adapter for shared OAuth token exchange."""

    def __init__(self, fetcher: Optional[Any]):
        self.fetcher = fetcher

    async def exchange_token(
        self, input: OAuthTokenEndpointRequest
    ) -> OAuthTokenEndpointResponse:
        if self.fetcher is None:
            raise OAuthHttpError(
                "A social OAuth fetcher is required",
                code="OAUTH_RUNTIME_CONFIG_INVALID",
                status=500,
            )

        client_secret, token_auth_method = await self._resolve_secret(input)
        headers = {
            "accept": "application/json",
            "content-type": "application/x-www-form-urlencoded",
        }
        body = {
            "grant_type": input.grant_type,
            "client_id": input.client_id,
        }
        if input.redirect_uri:
            body["redirect_uri"] = input.redirect_uri
        if input.code:
            body["code"] = input.code
        if input.code_verifier:
            body["code_verifier"] = input.code_verifier
        if input.refresh_token:
            body["refresh_token"] = input.refresh_token
        if input.scopes:
            body["scope"] = " ".join(input.scopes)

        if token_auth_method == "client_secret_basic":
            if not client_secret:
                raise OAuthHttpError(
                    "OAuth client secret is required",
                    code="OAUTH_RUNTIME_CONFIG_INVALID",
                    status=500,
                    details={"providerId": input.provider.id},
                )
            basic = base64.b64encode(
                f"{input.client_id}:{client_secret}".encode("utf-8")
            ).decode("utf-8")
            headers["authorization"] = f"Basic {basic}"
        elif client_secret:
            body["client_secret"] = client_secret

        response = await self.fetcher(
            input.provider.token_url,
            {
                "method": "POST",
                "headers": headers,
                "body": urlencode(body),
            },
        )
        raw_text = await response.text()
        payload = _parse_json_object(raw_text) or {}
        status = getattr(response, "status", 500)
        if not response.ok:
            normalized = normalize_oauth_error_body(payload)
            fallback = (
                "OAuth token refresh failed"
                if input.grant_type == "refresh_token"
                else "OAuth token exchange failed"
            )
            code = (
                "PROVIDER_RATE_LIMITED"
                if status == 429
                else (
                    "OAUTH_TOKEN_REFRESH_FAILED"
                    if input.grant_type == "refresh_token"
                    else "OAUTH_TOKEN_EXCHANGE_FAILED"
                )
            )
            raise OAuthHttpError(
                _sanitize_provider_error_message(normalized["message"], fallback),
                code=code,
                status=status,
                retryable=status == 429 or status >= 500,
                details={"providerId": input.provider.id, "status": status},
            )

        access_token = payload.get("access_token")
        if not access_token:
            raise OAuthHttpError(
                "OAuth token exchange failed",
                code="OAUTH_TOKEN_EXCHANGE_FAILED",
                status=502,
                details={"providerId": input.provider.id},
            )

        return OAuthTokenEndpointResponse.model_validate(
            {
                "accessToken": access_token,
                "refreshToken": payload.get("refresh_token"),
                "expiresIn": payload.get("expires_in"),
                "tokenType": payload.get("token_type"),
                "scope": payload.get("scope"),
                "idToken": payload.get("id_token"),
            }
        )

    async def revoke_token(self, input: OAuthRevocationRequest) -> None:
        if self.fetcher is None or input.provider.revocation_url is None:
            return

        client_secret, token_auth_method = await self._resolve_secret(
            OAuthTokenEndpointRequest.model_validate(
                {
                    "provider": input.provider,
                    "grantType": "refresh_token",
                    "clientId": input.client_id,
                    "clientSecret": input.client_secret,
                    "clientSecretResolver": input.client_secret_resolver,
                    "refreshToken": input.token,
                }
            )
        )
        headers = {
            "accept": "application/json",
            "content-type": "application/x-www-form-urlencoded",
        }
        body = {"token": input.token}
        if input.token_type_hint:
            body["token_type_hint"] = input.token_type_hint
        if token_auth_method == "client_secret_basic":
            if client_secret:
                basic = base64.b64encode(
                    f"{input.client_id}:{client_secret}".encode("utf-8")
                ).decode("utf-8")
                headers["authorization"] = f"Basic {basic}"
        else:
            body["client_id"] = input.client_id
            if client_secret:
                body["client_secret"] = client_secret

        await self.fetcher(
            input.provider.revocation_url,
            {"method": "POST", "headers": headers, "body": urlencode(body)},
        )

    async def _resolve_secret(
        self, input: OAuthTokenEndpointRequest
    ) -> tuple[Optional[str], str]:
        client_secret = input.client_secret
        token_auth_method = input.provider.token_auth_method or "client_secret_post"
        if client_secret is None and input.client_secret_resolver is not None:
            context = OAuthSecretResolverContext.model_validate(
                {
                    "provider": input.provider,
                    "operation": "exchange",
                    "clientId": input.client_id,
                    "grantType": input.grant_type,
                    "redirectUri": input.redirect_uri,
                    "scopes": input.scopes,
                }
            )
            try:
                resolved = await _maybe_await(input.client_secret_resolver(context))
            except Exception as error:  # noqa: BLE001
                raise secret_resolution_failed_error(context, error) from error
            payload = (
                resolved
                if isinstance(resolved, OAuthResolvedClientSecret)
                else OAuthResolvedClientSecret.model_validate(resolved)
            )
            client_secret = payload.client_secret
            token_auth_method = payload.token_auth_method or token_auth_method

        if token_auth_method not in ("client_secret_post", "client_secret_basic"):
            raise unsupported_token_auth_method_error(token_auth_method)
        return client_secret, token_auth_method


class SocialOAuthService:
    def __init__(
        self,
        config: AuthFnConfig,
        plugin_config: Optional[SocialOAuthPluginConfig] = None,
    ):
        self.config = config
        self.plugin_config = plugin_config or SocialOAuthPluginConfig()
        self.state_store = DbOAuthStateStore(config)
        self.token_vault = DbEncryptedTokenVault(
            config,
            default_key_ref=self.plugin_config.encryption_key_ref,
            now=self.plugin_config.now,
        )

    async def start(
        self,
        provider: str,
        *,
        return_to: Optional[str] = None,
        callback_mode: Optional[str] = None,
        request: Optional[Any] = None,
    ) -> Dict[str, Any]:
        runtime = resolve_runtime(self.config, request)
        provider_id = self._normalize_provider(provider)
        resolved = await self._run_before_start(
            request,
            runtime,
            {
                "provider": provider_id,
                "returnTo": return_to,
                "callbackMode": callback_mode or _infer_callback_mode(return_to),
            },
        )
        mode = _normalize_callback_mode(
            resolved.get("callbackMode") or callback_mode or _infer_callback_mode(return_to)
        )
        effective_return_to = resolved.get("returnTo") or return_to
        settings = self._resolve_provider_settings(provider_id, runtime)
        self._assert_allowed_return_to(settings, effective_return_to, mode)

        callback_uri = _build_callback_uri(runtime.base_url, self.config.base_path, provider_id)
        flow = self._create_flow_service(
            provider_id,
            request=request,
            runtime=runtime,
            settings=settings,
        )
        started = await flow.start(
            OAuthFlowStartInput.model_construct(
                provider_id=provider_id,
                redirect_uri=callback_uri,
                scopes=settings.scopes,
                request_id=event_request_id(request),
                subject=OAuthBrowserAuthSubject.model_validate(
                    {
                        "kind": "browser-auth",
                        "tenantId": self.config.namespace,
                        "regionId": runtime.region_id,
                        "intentId": _create_identifier("intent"),
                        "returnTo": effective_return_to,
                        "metadata": {"callbackMode": mode},
                    }
                ),
            )
        )
        return {
            "provider": provider_id,
            "redirectTo": started.authorization_url,
            "stateId": started.state_id,
            "expiresAt": started.expires_at,
        }

    async def handle_callback(
        self,
        provider: str,
        *,
        code: str,
        state: str,
        request: Optional[Any] = None,
    ) -> Dict[str, Any]:
        runtime = resolve_runtime(self.config, request)
        provider_id = self._normalize_provider(provider)
        settings = self._resolve_provider_settings(provider_id, runtime)
        callback_uri = _build_callback_uri(runtime.base_url, self.config.base_path, provider_id)
        flow = self._create_flow_service(
            provider_id,
            request=request,
            runtime=runtime,
            settings=settings,
        )

        try:
            callback = await flow.handle_callback(
                {
                    "providerId": provider_id,
                    "code": code,
                    "state": state,
                    "redirectUri": callback_uri,
                    "requestId": event_request_id(request),
                }
            )
        except Exception as error:  # noqa: BLE001
            raise _map_oauth_error(error) from error

        user_id = _callback_user_id(callback)
        if not user_id:
            raise OAuthCallbackInvalidError(
                "OAuth callback did not resolve an authfn user",
                {"provider": provider_id},
            )

        callback_mode = _normalize_callback_mode(
            (callback.subject.metadata or {}).get("callbackMode")
            or _infer_callback_mode(callback.subject.return_to)
        )
        completion = {
            "provider": provider_id,
            "linked": True,
            "callbackMode": callback_mode,
            "redirectTo": callback.subject.return_to,
        }
        await self._run_after_callback(request, runtime, user_id, completion)
        callback_mode = _normalize_callback_mode(completion.get("callbackMode") or callback_mode)
        redirect_to = completion.get("redirectTo")

        if callback_mode == "redirect":
            self._assert_allowed_return_to(settings, redirect_to, callback_mode)
            return {
                "status": 303,
                "redirectTo": redirect_to,
                "linked": True,
                "provider": provider_id,
                "callbackMode": callback_mode,
                "userId": user_id,
                "connectionId": callback.connection_id,
            }

        return {
            "status": 200,
            "callbackMode": callback_mode,
            "userId": user_id,
            "connectionId": callback.connection_id,
            "provider": provider_id,
            "body": {
                "ok": True,
                "data": {
                    "linked": True,
                    "provider": provider_id,
                },
            },
        }

    async def disconnect(self, user_id: str, provider: str) -> Dict[str, Any]:
        provider_id = self._normalize_provider(provider)
        account = await self.config.database.find_one(
            model="oauth_accounts",
            where=[
                {"field": "userId", "operator": "eq", "value": user_id},
                {"field": "provider", "operator": "eq", "value": provider_id},
            ],
            namespace=self.config.namespace,
        )
        if account is None:
            return {"disconnected": False, "provider": provider_id}

        flow = self._create_flow_service(
            provider_id,
            request=None,
            runtime=None,
            settings=self._resolve_provider_settings(
                provider_id,
                resolve_runtime(self.config, None),
            ),
        )
        await flow.disconnect(
            OAuthFlowDisconnectInput.model_validate(
                {
                    "connectionId": account["connectionId"],
                    "providerId": provider_id,
                    "requestId": event_request_id(),
                }
            )
        )
        return {"disconnected": True, "provider": provider_id}

    def _create_flow_service(
        self,
        provider_id: str,
        *,
        request: Optional[Any],
        runtime: Optional[AuthFnRuntimeResolution],
        settings: SocialProviderConfig,
    ) -> OAuthFlowService:
        resolved_runtime = runtime or resolve_runtime(self.config, request)

        async def resolve_identity(input: Any) -> OAuthFlowResolvedIdentity:
            token_set = input.token_set.model_dump(by_alias=True, exclude_none=True)
            identity = await self._resolve_local_identity(
                provider_id,
                token_set=token_set,
                settings=settings,
                request=request,
                runtime=resolved_runtime,
            )
            connection_id = identity.get("connectionId") or _create_identifier(
                f"soc_{provider_id}_{identity['user']['id']}"
            )
            return OAuthFlowResolvedIdentity.model_validate(
                {
                    "tenantId": self.config.namespace,
                    "userId": identity["user"]["id"],
                    "connectionId": connection_id,
                    "metadata": {
                        "providerAccountId": identity["profile"]["providerAccountId"],
                        "email": identity["profile"].get("email"),
                        "profile": identity["profile"].get("profile"),
                    },
                }
            )

        async def on_connected(result: Any) -> None:
            metadata = (
                result.resolved_identity.metadata
                if result.resolved_identity is not None
                else {}
            ) or {}
            user_id = _callback_user_id(result)
            if not user_id or not result.connection_id:
                return
            await self._upsert_oauth_account(
                user_id=user_id,
                provider=provider_id,
                provider_account_id=str(metadata.get("providerAccountId") or ""),
                connection_id=result.connection_id,
                email=metadata.get("email"),
                profile=metadata.get("profile"),
            )

        async def on_disconnected(input: OAuthFlowDisconnectInput) -> None:
            await self.config.database.delete_many(
                model="oauth_accounts",
                where=[
                    {"field": "provider", "operator": "eq", "value": provider_id},
                    {"field": "connectionId", "operator": "eq", "value": input.connection_id},
                ],
                namespace=self.config.namespace,
            )

        async def emit_flow_event(event: OAuthFlowEvent) -> None:
            event_name = {
                "oauth.flow.started": "authfn.oauth.started",
                "oauth.flow.start.failed": "authfn.oauth.failed",
                "oauth.flow.callback.success": "authfn.oauth.completed",
                "oauth.flow.callback.failed": "authfn.oauth.failed",
                "oauth.flow.disconnect.success": "authfn.oauth.disconnected",
                "oauth.flow.disconnect.failed": "authfn.oauth.failed",
                "oauth.flow.refresh.success": "authfn.oauth.refreshed",
                "oauth.flow.refresh.failed": "authfn.oauth.failed",
            }.get(event.name, "authfn.oauth.event")
            await emit_auth_event(
                self.config,
                {
                    "type": event_name,
                    "requestId": event.request_id,
                    "provider": event.provider_id,
                    "outcome": "success" if event.ok else "failed",
                    "metadata": {
                        "subjectKind": event.subject_kind,
                        "connectionId": event.connection_id,
                        "errorCode": event.error_code,
                        **(event.details or {}),
                    },
                },
            )

        return create_oauth_flow_service(
            OAuthFlowServiceConfig.model_validate(
                {
                    "providers": {provider_id: _provider_descriptor(provider_id)},
                    "providerRuntimeConfig": {
                        provider_id: OAuthProviderRuntimeConfig.model_validate(
                            {
                                "clientId": settings.client_id,
                                "clientSecret": settings.client_secret,
                                "allowlistedRedirectUris": settings.allowlisted_redirect_uris,
                                "clientSecretResolver": settings.client_secret_resolver,
                            }
                        )
                    },
                    "stateStore": self.state_store,
                    "tokenVault": self.token_vault,
                    "tokenHttpClient": FetchOAuthTokenHttpClient(self.plugin_config.fetcher),
                    "identityHooks": OAuthFlowIdentityHooks.model_validate(
                        {
                            "resolveBrowserAuthIdentity": resolve_identity,
                            "onConnected": on_connected,
                            "onDisconnected": on_disconnected,
                        }
                    ),
                    "keyRef": self.plugin_config.encryption_key_ref,
                    "stateTtlSeconds": self.plugin_config.state_ttl_seconds,
                    "now": self.plugin_config.now,
                    "emitEvent": emit_flow_event,
                }
            )
        )

    def _normalize_provider(self, provider: str) -> str:
        normalized = (provider or "").strip().lower()
        if normalized not in SOCIAL_PROVIDER_IDS:
            raise OAuthProviderUnsupportedError("Unsupported social OAuth provider")
        return normalized

    def _resolve_provider_settings(
        self, provider: str, runtime: AuthFnRuntimeResolution
    ) -> SocialProviderConfig:
        static = self.plugin_config.providers.get(provider, SocialProviderConfig())
        runtime_oauth = getattr(runtime, "oauth", None) or {}
        runtime_provider = runtime_oauth.get(provider, {})
        client_id = runtime_provider.get("clientId") or static.client_id
        if not client_id:
            raise ValidationError("Social OAuth runtime config missing clientId")

        return SocialProviderConfig(
            client_id=client_id,
            client_secret=runtime_provider.get("clientSecret") or static.client_secret,
            client_secret_resolver=runtime_provider.get("clientSecretResolver")
            or static.client_secret_resolver,
            allowlisted_return_to=runtime_provider.get("allowlistedReturnTo")
            or static.allowlisted_return_to,
            allowlisted_redirect_uris=runtime_provider.get("allowlistedRedirectUris")
            or static.allowlisted_redirect_uris,
            scopes=runtime_provider.get("scopes")
            or static.scopes
            or _provider_descriptor(provider).default_scopes,
            link_by_verified_email=static.link_by_verified_email,
            profile_resolver=static.profile_resolver,
        )

    def _assert_allowed_return_to(
        self,
        settings: SocialProviderConfig,
        return_to: Optional[str],
        callback_mode: str,
    ) -> None:
        if callback_mode != "redirect":
            return
        if not return_to or return_to not in settings.allowlisted_return_to:
            raise RedirectUriDisallowedError("Redirect target is not allowlisted")

    async def _resolve_local_identity(
        self,
        provider: str,
        *,
        token_set: Dict[str, Any],
        settings: SocialProviderConfig,
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
    ) -> Dict[str, Any]:
        profile = await self._resolve_profile(provider, token_set, settings)
        existing_account = await self.config.database.find_one(
            model="oauth_accounts",
            where=[
                {"field": "provider", "operator": "eq", "value": provider},
                {
                    "field": "providerAccountId",
                    "operator": "eq",
                    "value": profile["providerAccountId"],
                },
            ],
            namespace=self.config.namespace,
        )
        if existing_account is not None:
            user = await self.config.database.find_one(
                model="users",
                where=[{"field": "id", "operator": "eq", "value": existing_account["userId"]}],
                namespace=self.config.namespace,
            )
            if user is None:
                raise OAuthCallbackInvalidError(
                    "OAuth account links to a missing authfn user"
                )
            return {
                "user": user,
                "connectionId": existing_account.get("connectionId"),
                "profile": profile,
            }

        email = _normalize_email(profile.get("email"))
        if email:
            existing_user = await self.config.database.find_one(
                model="users",
                where=[{"field": "primaryEmail", "operator": "eq", "value": email}],
                namespace=self.config.namespace,
            )
            if existing_user is not None:
                if (
                    settings.link_by_verified_email
                    and profile.get("emailVerified") is True
                    and existing_user.get("emailVerifiedAt") is not None
                ):
                    return {
                        "user": existing_user,
                        "connectionId": None,
                        "profile": profile,
                    }
                raise ValidationError("A user with this email already exists")

        user = await self._create_social_user(
            provider,
            profile,
            request=request,
            runtime=runtime,
        )
        return {"user": user, "connectionId": None, "profile": profile}

    async def _create_social_user(
        self,
        provider: str,
        profile: Dict[str, Any],
        *,
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
    ) -> Dict[str, Any]:
        now = self.plugin_config.now()
        user = {
            "id": _create_identifier("user"),
            "primaryEmail": _normalize_email(profile.get("email")),
            "emailVerifiedAt": now if profile.get("emailVerified") else None,
            "createdAt": now,
            "updatedAt": now,
            "metadata": {
                "displayName": profile.get("name"),
                "socialProvider": provider,
            },
        }
        user = await self._run_before_user_create(request, runtime, user)
        await self.config.database.create(
            model="users",
            data=user,
            namespace=self.config.namespace,
        )
        await self._register_region_profile(
            user_id=user["id"],
            primary_email=user.get("primaryEmail"),
            request=request,
            runtime=runtime,
        )
        await self._run_after_user_create(request, runtime, user)
        return user

    async def _register_region_profile(
        self,
        *,
        user_id: str,
        primary_email: Optional[str],
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
    ) -> None:
        if get_plugin(self.config, "multiRegion") is None:
            return
        from .multi_region import MultiRegionPluginConfig, MultiRegionService

        plugin_config = get_plugin_config(
            self.config,
            "multiRegion",
            MultiRegionPluginConfig(),
        )
        await MultiRegionService(self.config, plugin_config).register_user(
            user_id=user_id,
            primary_email=primary_email,
            request=request,
            runtime=runtime,
        )

    async def _resolve_profile(
        self,
        provider: str,
        token_set: Dict[str, Any],
        settings: SocialProviderConfig,
    ) -> Dict[str, Any]:
        if settings.profile_resolver is not None:
            return await _maybe_await(
                settings.profile_resolver({"provider": provider, "tokenSet": token_set})
            )
        if provider == "google":
            return _resolve_google_profile(token_set)
        if provider == "apple":
            return _resolve_apple_profile(token_set)
        return await _resolve_github_profile(token_set, self.plugin_config.fetcher)

    async def _upsert_oauth_account(
        self,
        *,
        user_id: str,
        provider: str,
        provider_account_id: str,
        connection_id: str,
        email: Optional[str],
        profile: Optional[Dict[str, Any]],
    ) -> None:
        existing = await self.config.database.find_one(
            model="oauth_accounts",
            where=[
                {"field": "provider", "operator": "eq", "value": provider},
                {"field": "providerAccountId", "operator": "eq", "value": provider_account_id},
            ],
            namespace=self.config.namespace,
        )
        now = self.plugin_config.now()
        payload = {
            "userId": user_id,
            "provider": provider,
            "providerAccountId": provider_account_id,
            "connectionId": connection_id,
            "email": email,
            "profile": profile,
            "updatedAt": now,
        }
        if existing is None:
            await self.config.database.create(
                model="oauth_accounts",
                data={"id": _create_identifier("oauth"), **payload, "createdAt": now},
                namespace=self.config.namespace,
            )
            return

        await self.config.database.update(
            model="oauth_accounts",
            where=[{"field": "id", "operator": "eq", "value": existing["id"]}],
            data=payload,
            namespace=self.config.namespace,
        )

    async def _run_before_start(
        self,
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        hooks = self.config.hooks
        if hooks is None or hooks.before_oauth_start is None:
            return payload
        result = await _maybe_await(
            hooks.before_oauth_start(
                AuthFnHookContext(
                    config=self.config,
                    request=request,
                    runtime=runtime,
                    plugin_name="socialOAuth",
                ),
                payload,
            )
        )
        return result or payload

    async def _run_after_callback(
        self,
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
        actor_id: str,
        payload: Dict[str, Any],
    ) -> None:
        hooks = self.config.hooks
        if hooks is None or hooks.after_oauth_callback is None:
            return
        try:
            await _maybe_await(
                hooks.after_oauth_callback(
                    AuthFnHookContext(
                        config=self.config,
                        request=request,
                        runtime=runtime,
                        plugin_name="socialOAuth",
                        actor_id=actor_id,
                    ),
                    payload,
                )
            )
        except Exception:  # noqa: BLE001
            return

    async def _run_before_user_create(
        self,
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        hooks = self.config.hooks
        hook = getattr(hooks, "before_user_create", None) if hooks else None
        if hook is None:
            return payload
        try:
            result = await _maybe_await(
                hook(
                    AuthFnHookContext(
                        config=self.config,
                        request=request,
                        runtime=runtime,
                    ),
                    payload,
                )
            )
        except AuthFnError:
            raise
        except Exception as error:  # noqa: BLE001
            await emit_auth_event(
                self.config,
                {
                    "type": "authfn.plugin.failed",
                    "requestId": event_request_id(request),
                    "pluginName": "config",
                    "hookName": "beforeUserCreate",
                    "outcome": "aborted",
                    "metadata": {
                        "errorCode": "AUTHFN_INTERNAL_ERROR",
                        "retryable": False,
                    },
                },
            )
            raise PluginAbortedError(
                "beforeUserCreate hook aborted user creation",
                {"cause": str(error)},
            ) from error
        return result or payload

    async def _run_after_user_create(
        self,
        request: Optional[Any],
        runtime: AuthFnRuntimeResolution,
        user: Dict[str, Any],
    ) -> None:
        hooks = self.config.hooks
        hook = getattr(hooks, "after_user_create", None) if hooks else None
        if hook is None:
            return
        try:
            await _maybe_await(
                hook(
                    AuthFnHookContext(
                        config=self.config,
                        request=request,
                        runtime=runtime,
                        actor_id=user["id"],
                    ),
                    user,
                )
            )
        except Exception:  # noqa: BLE001
            await emit_auth_event(
                self.config,
                {
                    "type": "authfn.plugin.failed",
                    "requestId": event_request_id(request),
                    "actorId": user["id"],
                    "pluginName": "config",
                    "hookName": "afterUserCreate",
                    "outcome": "observed",
                    "metadata": {
                        "errorCode": "AUTHFN_INTERNAL_ERROR",
                        "retryable": False,
                    },
                },
            )
            return


def authfn_social_oauth_plugin(
    config: Optional[SocialOAuthPluginConfig] = None,
) -> AuthFnPlugin:
    resolved = config or SocialOAuthPluginConfig()
    plugin = AuthFnPlugin(
        name="socialOAuth",
        schema_factory=lambda _cfg: cast(List[TableSchema], _social_schema()),
        routes_factory=lambda _ctx: [
            {"method": "POST", "path": "/social/start"},
            {"method": "GET", "path": "/social/callback/:provider"},
            {"method": "POST", "path": "/social/disconnect/:provider"},
        ],
    )
    plugin._authfn_config = resolved
    return plugin


def _social_schema() -> List[Dict[str, Any]]:
    return [
        {
            "modelName": "oauth_states",
            "fields": {
                "state_id": {"type": "string", "required": True, "fieldName": "state_id"},
                "provider_id": {"type": "string", "required": True, "fieldName": "provider_id"},
                "subject_kind": {
                    "type": "string",
                    "required": True,
                    "fieldName": "subject_kind",
                },
                "subject_key": {"type": "string", "required": True, "fieldName": "subject_key"},
                "subject_payload": {
                    "type": "json",
                    "required": True,
                    "fieldName": "subject_payload",
                },
                "redirect_uri": {
                    "type": "string",
                    "required": True,
                    "fieldName": "redirect_uri",
                },
                "requested_scopes": {
                    "type": "json",
                    "required": True,
                    "fieldName": "requested_scopes",
                },
                "code_verifier": {
                    "type": "string",
                    "required": False,
                    "fieldName": "code_verifier",
                },
                "nonce": {"type": "string", "required": False, "fieldName": "nonce"},
                "created_at": {
                    "type": "string",
                    "required": True,
                    "fieldName": "created_at",
                },
                "expires_at": {
                    "type": "string",
                    "required": True,
                    "fieldName": "expires_at",
                },
                "consumed_at": {
                    "type": "string",
                    "required": False,
                    "fieldName": "consumed_at",
                },
            },
            "indexes": [{"name": "idx_oauth_states_expires_at", "fields": ["expires_at"]}],
        },
        {
            "modelName": "oauth_tokens",
            "fields": {
                "token_id": {"type": "string", "required": True, "fieldName": "token_id"},
                "tenant_id": {"type": "string", "required": True, "fieldName": "tenant_id"},
                "user_id": {"type": "string", "required": True, "fieldName": "user_id"},
                "provider_id": {"type": "string", "required": True, "fieldName": "provider_id"},
                "connection_id": {
                    "type": "string",
                    "required": True,
                    "fieldName": "connection_id",
                },
                "encrypted_payload": {
                    "type": "string",
                    "required": True,
                    "fieldName": "encrypted_payload",
                },
                "key_ref": {"type": "string", "required": True, "fieldName": "key_ref"},
                "created_at": {
                    "type": "string",
                    "required": True,
                    "fieldName": "created_at",
                },
                "updated_at": {
                    "type": "string",
                    "required": True,
                    "fieldName": "updated_at",
                },
                "expires_at": {
                    "type": "string",
                    "required": False,
                    "fieldName": "expires_at",
                },
            },
            "indexes": [{"name": "idx_oauth_tokens_connection", "fields": ["connection_id"]}],
        },
        {
            "modelName": "oauth_accounts",
            "fields": {
                "id": {"type": "string", "required": True, "fieldName": "id"},
                "userId": {"type": "string", "required": True, "fieldName": "user_id"},
                "provider": {"type": "string", "required": True, "fieldName": "provider"},
                "providerAccountId": {
                    "type": "string",
                    "required": True,
                    "fieldName": "provider_account_id",
                },
                "connectionId": {
                    "type": "string",
                    "required": True,
                    "fieldName": "connection_id",
                },
                "email": {"type": "string", "required": False, "fieldName": "email"},
                "profile": {"type": "json", "required": False, "fieldName": "profile"},
                "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
            },
            "indexes": [
                {
                    "name": "idx_authfn_oauth_accounts_provider_account",
                    "fields": ["provider", "providerAccountId"],
                }
            ],
        },
    ]


async def _resolve_github_profile(
    token_set: Dict[str, Any],
    fetcher: Any,
) -> Dict[str, Any]:
    if fetcher is None:
        raise ValidationError("A social OAuth fetcher is required")
    user_response = await fetcher(
        "https://api.github.com/user",
        {"method": "GET", "headers": {"authorization": f"Bearer {token_set['accessToken']}"}},
    )
    emails_response = await fetcher(
        "https://api.github.com/user/emails",
        {"method": "GET", "headers": {"authorization": f"Bearer {token_set['accessToken']}"}},
    )
    user_payload = _parse_json_object(await user_response.text()) or {}
    emails_payload = _parse_json_array(await emails_response.text()) or []
    if not user_response.ok or not emails_response.ok or not emails_payload:
        raise OAuthCallbackInvalidError("GitHub OAuth callback failed to resolve profile")
    primary = next((entry for entry in emails_payload if entry.get("primary")), emails_payload[0])
    provider_account_id = str(user_payload["id"])
    email = _normalize_email(primary.get("email"))
    return {
        "providerAccountId": provider_account_id,
        "email": email,
        "emailVerified": bool(primary.get("verified")),
        "name": user_payload.get("name") or user_payload.get("login"),
        "profile": {
            "id": provider_account_id,
            "email": email,
            "emailVerified": bool(primary.get("verified")),
            "name": user_payload.get("name") or user_payload.get("login"),
        },
    }


def _resolve_google_profile(token_set: Dict[str, Any]) -> Dict[str, Any]:
    claims = _parse_id_token_claims(token_set.get("idToken"))
    if not claims.get("sub"):
        raise OAuthCallbackInvalidError(
            "Google OAuth callback missing required subject claim"
        )
    return {
        "providerAccountId": claims["sub"],
        "email": _normalize_email(claims.get("email")),
        "emailVerified": claims.get("emailVerified"),
        "name": claims.get("name"),
        "profile": claims,
    }


def _resolve_apple_profile(token_set: Dict[str, Any]) -> Dict[str, Any]:
    claims = _parse_id_token_claims(token_set.get("idToken"))
    if not claims.get("sub") or not claims.get("email"):
        raise OAuthCallbackInvalidError("Apple OAuth callback missing required claims")
    return {
        "providerAccountId": claims["sub"],
        "email": _normalize_email(claims.get("email")),
        "emailVerified": claims.get("emailVerified", True),
        "name": claims.get("name"),
        "profile": claims,
    }


def _parse_id_token_claims(id_token: Optional[str]) -> Dict[str, Any]:
    if not id_token:
        return {}
    parts = id_token.split(".")
    if len(parts) < 2:
        return {}
    payload = _parse_json_object(_decode_base64url(parts[1]).decode("utf-8")) or {}
    name = payload.get("name")
    if not name:
        given = payload.get("given_name")
        family = payload.get("family_name")
        if given or family:
            name = " ".join(part for part in [given, family] if part)
    return {
        "sub": payload.get("sub"),
        "email": payload.get("email"),
        "emailVerified": payload.get("email_verified"),
        "name": name,
    }


def _decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _provider_descriptor(provider: str) -> OAuthProviderDescriptor:
    descriptors = {
        "google": {
            "id": "google",
            "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth",
            "tokenUrl": "https://oauth2.googleapis.com/token",
            "defaultScopes": ["openid", "email", "profile"],
            "supportsPkce": True,
            "supportsRefreshToken": True,
        },
        "apple": {
            "id": "apple",
            "authorizationUrl": "https://appleid.apple.com/auth/authorize",
            "tokenUrl": "https://appleid.apple.com/auth/token",
            "defaultScopes": ["name", "email"],
            "supportsPkce": True,
            "supportsRefreshToken": True,
        },
        "github": {
            "id": "github",
            "authorizationUrl": "https://github.com/login/oauth/authorize",
            "tokenUrl": "https://github.com/login/oauth/access_token",
            "defaultScopes": ["read:user", "user:email"],
            "supportsPkce": True,
            "supportsRefreshToken": False,
        },
    }
    return OAuthProviderDescriptor.model_validate(descriptors[provider])


def _build_callback_uri(base_url: str, base_path: str, provider: str) -> str:
    return f"{base_url.rstrip('/')}{base_path}/social/callback/{provider}"


def _normalize_email(email: Optional[str]) -> Optional[str]:
    if email is None:
        return None
    return email.strip().lower()


def _create_identifier(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _infer_callback_mode(return_to: Optional[str]) -> str:
    return "redirect" if return_to else "json"


def _normalize_callback_mode(value: str) -> str:
    if value not in ("redirect", "json"):
        raise ValidationError("callbackMode must be 'redirect' or 'json'")
    return value


def _state_from_row(row: Dict[str, Any]) -> OAuthStateRecord:
    subject_payload = _parse_json_object(row.get("subject_payload")) or {}
    return apply_subject_to_state_record(
        OAuthStateRecord.model_validate(
            {
                "stateId": row["state_id"],
                "providerId": row["provider_id"],
                "redirectUri": row["redirect_uri"],
                "requestedScopes": _parse_json_array(row.get("requested_scopes")) or [],
                "codeVerifier": row.get("code_verifier"),
                "nonce": row.get("nonce"),
                "subject": subject_payload or None,
                "createdAt": row["created_at"],
                "expiresAt": row["expires_at"],
                "consumedAt": row.get("consumed_at"),
            }
        )
    )


def _token_record_from_row(row: Dict[str, Any]) -> TokenRecord:
    return TokenRecord.model_validate(
        {
            "tokenId": row["token_id"],
            "tenantId": row["tenant_id"],
            "userId": row["user_id"],
            "providerId": row["provider_id"],
            "connectionId": row["connection_id"],
            "encryptedPayload": row["encrypted_payload"],
            "keyRef": row["key_ref"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "expiresAt": row.get("expires_at"),
        }
    )


def _map_oauth_error(error: Exception) -> Exception:
    if isinstance(error, AuthFnError):
        return error
    code = getattr(error, "code", None)
    details = getattr(error, "details", None)
    if code == ValidationError.code:
        return ValidationError(str(error), details)
    if code == OAuthCallbackInvalidError.code:
        return OAuthCallbackInvalidError(str(error), details)
    if code == RedirectUriDisallowedError.code:
        return RedirectUriDisallowedError(str(error), details)
    if code == OAuthProviderUnsupportedError.code:
        return OAuthProviderUnsupportedError(str(error), details)
    if code == "OAUTH_STATE_REPLAYED":
        return OAuthStateReplayedError(str(error), details)
    if code == "OAUTH_STATE_INVALID":
        return OAuthStateInvalidError(str(error), details)
    if code == "OAUTH_REDIRECT_DISALLOWED":
        return RedirectUriDisallowedError(str(error), details)
    if code == "OAUTH_CALLBACK_MISMATCH":
        return OAuthCallbackInvalidError(str(error), details)
    if code == "OAUTH_PROVIDER_UNSUPPORTED":
        return OAuthProviderUnsupportedError(str(error), details)
    return to_authfn_error(error)


def _callback_user_id(result: Any) -> Optional[str]:
    resolved_identity = getattr(result, "resolved_identity", None)
    if resolved_identity is not None and resolved_identity.user_id:
        return resolved_identity.user_id
    subject = getattr(result, "subject", None)
    return getattr(subject, "user_id", None) if subject is not None else None


def _derive_fernet_key(namespace: str, key_ref: str) -> bytes:
    digest = hashlib.sha256(f"{namespace}:{key_ref}:oauth".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _parse_json_object(value: Any) -> Optional[Dict[str, Any]]:
    if value is None:
        return None
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        parsed = json.loads(value)
        return dict(parsed) if isinstance(parsed, dict) else None
    return None


def _parse_json_array(value: Any) -> Optional[List[Any]]:
    if value is None:
        return None
    if isinstance(value, list):
        return list(value)
    if isinstance(value, str):
        parsed = json.loads(value)
        return list(parsed) if isinstance(parsed, list) else None
    return None


def _sanitize_provider_error_message(message: str, fallback: str) -> str:
    lowered = message.lower()
    if any(word in lowered for word in ("secret", "token", "bearer", "authorization", "key")):
        return fallback
    return message


async def _maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return await value
    return value


__all__ = [
    "SocialOAuthPluginConfig",
    "SocialOAuthService",
    "SocialProviderConfig",
    "authfn_social_oauth_plugin",
]
