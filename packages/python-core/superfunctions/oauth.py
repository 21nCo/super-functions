"""Shared OAuth flow primitives for Python superfunctions packages."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlencode

from pydantic import BaseModel, ConfigDict, Field


class OAuthModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


class OAuthHttpError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "OAUTH_HTTP_ERROR",
        status: int = 500,
        retryable: bool = False,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.retryable = retryable
        self.details = details or {}


class OAuthBrowserAuthSubject(OAuthModel):
    kind: str
    tenant_id: Optional[str] = Field(default=None, alias="tenantId")
    region_id: Optional[str] = Field(default=None, alias="regionId")
    intent_id: Optional[str] = Field(default=None, alias="intentId")
    return_to: Optional[str] = Field(default=None, alias="returnTo")
    metadata: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = Field(default=None, alias="userId")


class OAuthFlowStartInput(OAuthModel):
    provider_id: str = Field(alias="providerId")
    redirect_uri: str = Field(alias="redirectUri")
    scopes: List[str] = Field(default_factory=list)
    request_id: Optional[str] = Field(default=None, alias="requestId")
    subject: OAuthBrowserAuthSubject


class OAuthProviderDescriptor(OAuthModel):
    id: str
    authorization_url: str = Field(alias="authorizationUrl")
    token_url: str = Field(alias="tokenUrl")
    revocation_url: Optional[str] = Field(default=None, alias="revocationUrl")
    default_scopes: List[str] = Field(default_factory=list, alias="defaultScopes")
    supports_pkce: bool = Field(default=True, alias="supportsPkce")
    supports_refresh_token: bool = Field(default=False, alias="supportsRefreshToken")
    token_auth_method: Optional[str] = Field(default=None, alias="tokenAuthMethod")


class OAuthProviderRuntimeConfig(OAuthModel):
    client_id: Optional[str] = Field(default=None, alias="clientId")
    client_secret: Optional[str] = Field(default=None, alias="clientSecret")
    allowlisted_redirect_uris: List[str] = Field(default_factory=list, alias="allowlistedRedirectUris")
    client_secret_resolver: Optional[Callable[..., Any]] = Field(default=None, alias="clientSecretResolver")


class OAuthResolvedClientSecret(OAuthModel):
    client_secret: str = Field(alias="clientSecret")
    token_auth_method: Optional[str] = Field(default=None, alias="tokenAuthMethod")


class OAuthSecretResolverContext(OAuthModel):
    provider: OAuthProviderDescriptor
    operation: str
    client_id: str = Field(alias="clientId")
    grant_type: str = Field(alias="grantType")
    redirect_uri: Optional[str] = Field(default=None, alias="redirectUri")
    scopes: List[str] = Field(default_factory=list)


class OAuthTokenEndpointRequest(OAuthModel):
    provider: OAuthProviderDescriptor
    client_id: str = Field(alias="clientId")
    client_secret: Optional[str] = Field(default=None, alias="clientSecret")
    client_secret_resolver: Optional[Callable[..., Any]] = Field(default=None, alias="clientSecretResolver")
    grant_type: str = Field(alias="grantType")
    redirect_uri: Optional[str] = Field(default=None, alias="redirectUri")
    code: Optional[str] = None
    code_verifier: Optional[str] = Field(default=None, alias="codeVerifier")
    refresh_token: Optional[str] = Field(default=None, alias="refreshToken")
    scopes: List[str] = Field(default_factory=list)


class OAuthTokenEndpointResponse(OAuthModel):
    access_token: str = Field(alias="accessToken")
    refresh_token: Optional[str] = Field(default=None, alias="refreshToken")
    expires_in: Optional[int] = Field(default=None, alias="expiresIn")
    token_type: Optional[str] = Field(default=None, alias="tokenType")
    scope: Optional[str] = None
    id_token: Optional[str] = Field(default=None, alias="idToken")


class OAuthRevocationRequest(OAuthModel):
    provider: OAuthProviderDescriptor
    client_id: str = Field(alias="clientId")
    client_secret: Optional[str] = Field(default=None, alias="clientSecret")
    client_secret_resolver: Optional[Callable[..., Any]] = Field(default=None, alias="clientSecretResolver")
    token: str
    token_type_hint: Optional[str] = Field(default=None, alias="tokenTypeHint")


class OAuthStateRecord(OAuthModel):
    state_id: str = Field(alias="stateId")
    provider_id: str = Field(alias="providerId")
    redirect_uri: str = Field(alias="redirectUri")
    requested_scopes: List[str] = Field(default_factory=list, alias="requestedScopes")
    code_verifier: Optional[str] = Field(default=None, alias="codeVerifier")
    nonce: Optional[str] = None
    subject: Optional[OAuthBrowserAuthSubject] = None
    created_at: str = Field(alias="createdAt")
    expires_at: str = Field(alias="expiresAt")
    consumed_at: Optional[str] = Field(default=None, alias="consumedAt")


class TokenRecord(OAuthModel):
    token_id: str = Field(alias="tokenId")
    tenant_id: str = Field(alias="tenantId")
    user_id: str = Field(alias="userId")
    provider_id: str = Field(alias="providerId")
    connection_id: str = Field(alias="connectionId")
    encrypted_payload: str = Field(alias="encryptedPayload")
    key_ref: str = Field(alias="keyRef")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    expires_at: Optional[str] = Field(default=None, alias="expiresAt")


class OAuthFlowResolvedIdentity(OAuthModel):
    tenant_id: str = Field(alias="tenantId")
    user_id: str = Field(alias="userId")
    connection_id: str = Field(alias="connectionId")
    metadata: Optional[Dict[str, Any]] = None


class OAuthFlowIdentityHooks(OAuthModel):
    resolve_browser_auth_identity: Callable[..., Any] = Field(alias="resolveBrowserAuthIdentity")
    on_connected: Optional[Callable[..., Any]] = Field(default=None, alias="onConnected")
    on_disconnected: Optional[Callable[..., Any]] = Field(default=None, alias="onDisconnected")


class OAuthFlowDisconnectInput(OAuthModel):
    connection_id: str = Field(alias="connectionId")
    provider_id: str = Field(alias="providerId")
    request_id: Optional[str] = Field(default=None, alias="requestId")


class OAuthFlowEvent(OAuthModel):
    name: str
    ok: bool
    provider_id: str = Field(alias="providerId")
    request_id: Optional[str] = Field(default=None, alias="requestId")
    subject_kind: Optional[str] = Field(default=None, alias="subjectKind")
    connection_id: Optional[str] = Field(default=None, alias="connectionId")
    error_code: Optional[str] = Field(default=None, alias="errorCode")
    details: Optional[Dict[str, Any]] = None


class OAuthFlowServiceConfig(OAuthModel):
    providers: Dict[str, OAuthProviderDescriptor]
    provider_runtime_config: Dict[str, OAuthProviderRuntimeConfig] = Field(alias="providerRuntimeConfig")
    state_store: Any = Field(alias="stateStore")
    token_vault: Any = Field(alias="tokenVault")
    token_http_client: Any = Field(alias="tokenHttpClient")
    identity_hooks: OAuthFlowIdentityHooks = Field(alias="identityHooks")
    key_ref: str = Field(alias="keyRef")
    state_ttl_seconds: int = Field(default=600, alias="stateTtlSeconds")
    now: Callable[[], datetime]
    emit_event: Optional[Callable[..., Any]] = Field(default=None, alias="emitEvent")


class OAuthFlowStartResult(OAuthModel):
    authorization_url: str = Field(alias="authorizationUrl")
    state_id: str = Field(alias="stateId")
    expires_at: str = Field(alias="expiresAt")


class OAuthFlowResolveIdentityInput(OAuthModel):
    provider_id: str = Field(alias="providerId")
    subject: OAuthBrowserAuthSubject
    token_set: OAuthTokenEndpointResponse = Field(alias="tokenSet")


class OAuthFlowCallbackResult(OAuthModel):
    subject: OAuthBrowserAuthSubject
    resolved_identity: Optional[OAuthFlowResolvedIdentity] = Field(default=None, alias="resolvedIdentity")
    connection_id: Optional[str] = Field(default=None, alias="connectionId")


def apply_subject_to_state_record(record: OAuthStateRecord) -> OAuthStateRecord:
    if record.subject is not None and not isinstance(record.subject, OAuthBrowserAuthSubject):
        record.subject = OAuthBrowserAuthSubject.model_validate(record.subject)
    return record


def resolve_oauth_stored_subject(record: OAuthStateRecord) -> OAuthBrowserAuthSubject:
    normalized = apply_subject_to_state_record(record)
    if normalized.subject is None:
        raise OAuthHttpError("OAuth subject is missing", code="OAUTH_STATE_INVALID", status=400)
    return normalized.subject


def get_oauth_subject_key(subject: OAuthBrowserAuthSubject) -> str:
    if subject.user_id:
        return f"{subject.kind}:{subject.user_id}"
    if subject.intent_id:
        return f"{subject.kind}:{subject.intent_id}"
    return f"{subject.kind}:{subject.tenant_id or 'anonymous'}"


def normalize_oauth_error_body(payload: Optional[Dict[str, Any]]) -> Dict[str, str]:
    payload = payload or {}
    message = (
        payload.get("error_description")
        or payload.get("message")
        or payload.get("error")
        or "OAuth request failed"
    )
    return {"message": str(message)}


def secret_resolution_failed_error(
    context: OAuthSecretResolverContext,
    error: Exception,
) -> OAuthHttpError:
    return OAuthHttpError(
        "OAuth client secret resolution failed",
        code="OAUTH_SECRET_RESOLUTION_FAILED",
        status=500,
        details={"providerId": context.provider.id, "cause": str(error)},
    )


def unsupported_token_auth_method_error(token_auth_method: str) -> OAuthHttpError:
    return OAuthHttpError(
        "Unsupported OAuth token auth method",
        code="OAUTH_RUNTIME_CONFIG_INVALID",
        status=500,
        details={"tokenAuthMethod": token_auth_method},
    )


def create_oauth_flow_service(config: OAuthFlowServiceConfig) -> "OAuthFlowService":
    return OAuthFlowService(config)


@dataclass
class OAuthFlowService:
    config: OAuthFlowServiceConfig

    async def start(self, input: OAuthFlowStartInput) -> OAuthFlowStartResult:
        provider = self.config.providers[input.provider_id]
        runtime = self.config.provider_runtime_config[input.provider_id]
        now = self.config.now()
        created_at = _isoformat(now)
        expires_at = _isoformat(now + timedelta(seconds=self.config.state_ttl_seconds))
        state_id = _create_identifier("oauth_state")
        code_verifier = secrets.token_urlsafe(48)
        nonce = secrets.token_urlsafe(24)
        requested_scopes = list(input.scopes or provider.default_scopes)

        try:
            self._assert_redirect_uri_allowed(runtime, input.redirect_uri)

            state_record = OAuthStateRecord.model_validate(
                {
                    "stateId": state_id,
                    "providerId": input.provider_id,
                    "redirectUri": input.redirect_uri,
                    "requestedScopes": requested_scopes,
                    "codeVerifier": code_verifier,
                    "nonce": nonce,
                    "subject": input.subject.model_dump(by_alias=True, exclude_none=True),
                    "createdAt": created_at,
                    "expiresAt": expires_at,
                }
            )
            await self.config.state_store.put(state_record)

            authorization_url = self._build_authorization_url(
                provider=provider,
                runtime=runtime,
                redirect_uri=input.redirect_uri,
                scopes=requested_scopes,
                state_id=state_id,
                code_verifier=code_verifier,
                nonce=nonce,
            )
            await self._emit_event(
                OAuthFlowEvent.model_validate(
                    {
                        "name": "oauth.flow.started",
                        "ok": True,
                        "providerId": input.provider_id,
                        "requestId": input.request_id,
                        "subjectKind": input.subject.kind,
                    }
                )
            )
            return OAuthFlowStartResult.model_validate(
                {
                    "authorizationUrl": authorization_url,
                    "stateId": state_id,
                    "expiresAt": expires_at,
                }
            )
        except Exception as error:
            await self._emit_failure(
                input.provider_id,
                input.request_id,
                error,
                input.subject,
                event_name="oauth.flow.start.failed",
            )
            raise

    async def handle_callback(self, input: Dict[str, Any]) -> OAuthFlowCallbackResult:
        provider_id = input["providerId"]
        provider = self.config.providers[provider_id]
        runtime = self.config.provider_runtime_config[provider_id]
        request_id = input.get("requestId")
        state = await self.config.state_store.get(input["state"])
        consumed_at = _isoformat(self.config.now())

        if state is None:
            error = OAuthHttpError("OAuth state is invalid", code="OAUTH_STATE_INVALID", status=400)
            await self._emit_failure(provider_id, request_id, error)
            raise error

        normalized_state = apply_subject_to_state_record(state)
        if normalized_state.provider_id != provider_id:
            error = OAuthHttpError("OAuth callback did not match state", code="OAUTH_CALLBACK_MISMATCH", status=400)
            await self._emit_failure(provider_id, request_id, error, normalized_state.subject)
            raise error
        if _parse_utc_timestamp(normalized_state.expires_at) <= _as_utc(self.config.now()):
            error = OAuthHttpError("OAuth state has expired", code="OAUTH_STATE_INVALID", status=400)
            await self._emit_failure(provider_id, request_id, error, normalized_state.subject)
            raise error

        consumed = await self.config.state_store.consume(input["state"], consumed_at)
        if consumed is None:
            replayed = await self.config.state_store.get(input["state"])
            code = "OAUTH_STATE_REPLAYED" if replayed and replayed.consumed_at is not None else "OAUTH_STATE_INVALID"
            message = "OAuth state has already been used" if code == "OAUTH_STATE_REPLAYED" else "OAuth state is invalid"
            error = OAuthHttpError(message, code=code, status=400)
            await self._emit_failure(provider_id, request_id, error, normalized_state.subject)
            raise error

        try:
            consumed_subject = resolve_oauth_stored_subject(consumed)
            token_response = await self.config.token_http_client.exchange_token(
                OAuthTokenEndpointRequest.model_validate(
                    {
                        "provider": provider.model_dump(by_alias=True, exclude_none=True),
                        "clientId": runtime.client_id,
                        "clientSecret": runtime.client_secret,
                        "clientSecretResolver": runtime.client_secret_resolver,
                        "grantType": "authorization_code",
                        "redirectUri": consumed.redirect_uri,
                        "code": input["code"],
                        "codeVerifier": consumed.code_verifier,
                        "scopes": consumed.requested_scopes,
                    }
                )
            )
            resolved_identity = await self.config.identity_hooks.resolve_browser_auth_identity(
                OAuthFlowResolveIdentityInput.model_validate(
                    {
                        "providerId": provider_id,
                        "subject": consumed_subject.model_dump(by_alias=True, exclude_none=True),
                        "tokenSet": token_response.model_dump(by_alias=True, exclude_none=True),
                    }
                )
            )
            if not isinstance(resolved_identity, OAuthFlowResolvedIdentity):
                resolved_identity = OAuthFlowResolvedIdentity.model_validate(resolved_identity)

            await self.config.token_vault.put(
                TokenRecord.model_validate(
                    {
                        "tokenId": _create_identifier("oauth_token"),
                        "tenantId": resolved_identity.tenant_id,
                        "userId": resolved_identity.user_id,
                        "providerId": provider_id,
                        "connectionId": resolved_identity.connection_id,
                        "encryptedPayload": json.dumps(
                            token_response.model_dump(by_alias=True, exclude_none=True),
                            sort_keys=True,
                        ),
                        "keyRef": self.config.key_ref,
                        "createdAt": consumed_at,
                        "updatedAt": consumed_at,
                        "expiresAt": _expires_at(consumed_at, token_response.expires_in),
                    }
                )
            )

            result = OAuthFlowCallbackResult.model_validate(
                {
                    "subject": consumed_subject.model_dump(by_alias=True, exclude_none=True),
                    "resolvedIdentity": resolved_identity.model_dump(by_alias=True, exclude_none=True),
                    "connectionId": resolved_identity.connection_id,
                }
            )
            if self.config.identity_hooks.on_connected is not None:
                await _maybe_await(self.config.identity_hooks.on_connected(result))
            await self._emit_event(
                OAuthFlowEvent.model_validate(
                    {
                        "name": "oauth.flow.callback.success",
                        "ok": True,
                        "providerId": provider_id,
                        "requestId": request_id,
                        "subjectKind": consumed_subject.kind,
                        "connectionId": resolved_identity.connection_id,
                    }
                )
            )
            return result
        except Exception as error:
            await self._emit_failure(provider_id, request_id, error, normalized_state.subject)
            raise

    async def disconnect(self, input: OAuthFlowDisconnectInput) -> None:
        provider_id = input.provider_id
        try:
            await self.config.token_vault.delete_by_connection(input.connection_id)
            if self.config.identity_hooks.on_disconnected is not None:
                await _maybe_await(self.config.identity_hooks.on_disconnected(input))
            await self._emit_event(
                OAuthFlowEvent.model_validate(
                    {
                        "name": "oauth.flow.disconnect.success",
                        "ok": True,
                        "providerId": provider_id,
                        "requestId": input.request_id,
                        "connectionId": input.connection_id,
                    }
                )
            )
        except Exception as error:
            await self._emit_failure(
                provider_id,
                input.request_id,
                error,
                None,
                input.connection_id,
                event_name="oauth.flow.disconnect.failed",
            )
            raise

    async def _emit_event(self, event: OAuthFlowEvent) -> None:
        if self.config.emit_event is None:
            return
        await _maybe_await(self.config.emit_event(event))

    async def _emit_failure(
        self,
        provider_id: str,
        request_id: Optional[str],
        error: Exception,
        subject: Optional[OAuthBrowserAuthSubject] = None,
        connection_id: Optional[str] = None,
        event_name: str = "oauth.flow.callback.failed",
    ) -> None:
        await self._emit_event(
            OAuthFlowEvent.model_validate(
                {
                    "name": event_name,
                    "ok": False,
                    "providerId": provider_id,
                    "requestId": request_id,
                    "subjectKind": subject.kind if subject is not None else None,
                    "connectionId": connection_id,
                    "errorCode": getattr(error, "code", None),
                    "details": getattr(error, "details", None),
                }
            )
        )

    def _build_authorization_url(
        self,
        *,
        provider: OAuthProviderDescriptor,
        runtime: OAuthProviderRuntimeConfig,
        redirect_uri: str,
        scopes: List[str],
        state_id: str,
        code_verifier: str,
        nonce: str,
    ) -> str:
        params: Dict[str, str] = {
            "response_type": "code",
            "client_id": runtime.client_id or "",
            "redirect_uri": redirect_uri,
            "scope": " ".join(scopes),
            "state": state_id,
            "nonce": nonce,
        }
        if provider.supports_pkce:
            params["code_challenge"] = _pkce_challenge(code_verifier)
            params["code_challenge_method"] = "S256"
        return f"{provider.authorization_url}?{urlencode(params)}"

    def _assert_redirect_uri_allowed(
        self,
        runtime: OAuthProviderRuntimeConfig,
        redirect_uri: str,
    ) -> None:
        if (
            runtime.allowlisted_redirect_uris
            and redirect_uri not in runtime.allowlisted_redirect_uris
        ):
            raise OAuthHttpError(
                "OAuth redirect URI is not allowlisted",
                code="OAUTH_REDIRECT_DISALLOWED",
                status=400,
                details={"redirectUri": redirect_uri},
            )


def _create_identifier(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _pkce_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _isoformat(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_utc_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return _as_utc(parsed)


def _expires_at(created_at: str, expires_in: Optional[int]) -> Optional[str]:
    if expires_in is None:
        return None
    base = datetime.fromisoformat(created_at)
    return _isoformat(_as_utc(base) + timedelta(seconds=expires_in))


async def _maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return await value
    return value


__all__ = [
    "OAuthBrowserAuthSubject",
    "OAuthFlowDisconnectInput",
    "OAuthFlowEvent",
    "OAuthFlowIdentityHooks",
    "OAuthFlowResolvedIdentity",
    "OAuthFlowService",
    "OAuthFlowServiceConfig",
    "OAuthFlowStartInput",
    "OAuthHttpError",
    "OAuthProviderDescriptor",
    "OAuthProviderRuntimeConfig",
    "OAuthResolvedClientSecret",
    "OAuthRevocationRequest",
    "OAuthSecretResolverContext",
    "OAuthStateRecord",
    "OAuthTokenEndpointRequest",
    "OAuthTokenEndpointResponse",
    "TokenRecord",
    "apply_subject_to_state_record",
    "create_oauth_flow_service",
    "get_oauth_subject_key",
    "normalize_oauth_error_body",
    "resolve_oauth_stored_subject",
    "secret_resolution_failed_error",
    "unsupported_token_auth_method_error",
]
