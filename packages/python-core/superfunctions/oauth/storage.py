"""Shared OAuth storage contracts and validation helpers."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Protocol, Union

from pydantic import BaseModel, Field


class OAuthConnectionSubject(BaseModel):
    """Stored subject for connection-oriented OAuth installs."""

    kind: Literal["connection"] = "connection"
    tenant_id: str = Field(alias="tenantId")
    user_id: str = Field(alias="userId")
    connection_id: Optional[str] = Field(None, alias="connectionId")

    class Config:
        populate_by_name = True


class OAuthBrowserAuthSubject(BaseModel):
    """Stored subject for browser-based sign-in intents."""

    kind: Literal["browser-auth", "browser"] = "browser-auth"
    intent_id: Optional[str] = Field(None, alias="intentId")
    tenant_id: Optional[str] = Field(None, alias="tenantId")
    region_id: Optional[str] = Field(None, alias="regionId")
    return_to: Optional[str] = Field(None, alias="returnTo")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


OAuthStoredSubject = Union[OAuthConnectionSubject, OAuthBrowserAuthSubject]


class OAuthStateRecord(BaseModel):
    """Serialized OAuth state persisted across redirect-based flows."""

    state_id: str = Field(alias="stateId")
    provider_id: str = Field(alias="providerId")
    redirect_uri: str = Field(alias="redirectUri")
    requested_scopes: List[str] = Field(alias="requestedScopes")
    subject: Optional[OAuthStoredSubject] = None
    tenant_id: Optional[str] = Field(None, alias="tenantId")
    user_id: Optional[str] = Field(None, alias="userId")
    connection_id: Optional[str] = Field(None, alias="connectionId")
    intent_id: Optional[str] = Field(None, alias="intentId")
    region_id: Optional[str] = Field(None, alias="regionId")
    return_to: Optional[str] = Field(None, alias="returnTo")
    metadata: Optional[Dict[str, Any]] = None
    code_verifier: Optional[str] = Field(None, alias="codeVerifier")
    nonce: Optional[str] = None
    created_at: str = Field(alias="createdAt")
    expires_at: str = Field(alias="expiresAt")
    consumed_at: Optional[str] = Field(None, alias="consumedAt")

    class Config:
        populate_by_name = True


class TokenRecord(BaseModel):
    """Persisted encrypted OAuth token payload."""

    token_id: str = Field(alias="tokenId")
    tenant_id: str = Field(alias="tenantId")
    user_id: str = Field(alias="userId")
    provider_id: str = Field(alias="providerId")
    connection_id: str = Field(alias="connectionId")
    encrypted_payload: str = Field(alias="encryptedPayload")
    key_ref: str = Field(alias="keyRef")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    expires_at: Optional[str] = Field(None, alias="expiresAt")

    class Config:
        populate_by_name = True


class OAuthConsentRecord(BaseModel):
    """Persisted consent grant for a subject and provider."""

    consent_id: str = Field(alias="consentId")
    provider_id: str = Field(alias="providerId")
    subject: OAuthStoredSubject
    scopes: List[str]
    granted_at: str = Field(alias="grantedAt")
    updated_at: str = Field(alias="updatedAt")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class OAuthRevocationFailureRecord(BaseModel):
    """Persisted remote revocation failure for later inspection or retry."""

    failure_id: str = Field(alias="failureId")
    provider_id: str = Field(alias="providerId")
    subject: OAuthStoredSubject
    token_id: Optional[str] = Field(None, alias="tokenId")
    token_type_hint: Optional[Literal["access_token", "refresh_token"]] = Field(
        None, alias="tokenTypeHint"
    )
    error_code: str = Field(alias="errorCode")
    error_message: str = Field(alias="errorMessage")
    retryable: bool
    occurred_at: str = Field(alias="occurredAt")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class OAuthStorageFieldDefinition(BaseModel):
    """Storage field definition for shared OAuth schemas."""

    name: str
    type: Literal["text", "json", "boolean"]
    nullable: bool = False
    primary_key: bool = Field(False, alias="primaryKey")
    unique: bool = False

    class Config:
        populate_by_name = True


class OAuthStorageIndexDefinition(BaseModel):
    """Storage index definition for shared OAuth schemas."""

    name: str
    fields: List[str]
    unique: bool = False


class OAuthStorageTableDefinition(BaseModel):
    """Storage table definition for shared OAuth schemas."""

    name: str
    fields: List[OAuthStorageFieldDefinition]
    indexes: Optional[List[OAuthStorageIndexDefinition]] = None


class OAuthStateStore(Protocol):
    """Shared OAuth state persistence protocol."""

    async def put(self, record: OAuthStateRecord) -> None:
        pass

    async def get(self, state_id: str) -> Optional[OAuthStateRecord]:
        pass

    async def consume(self, state_id: str, consumed_at: str) -> Optional[OAuthStateRecord]:
        pass

    async def delete_expired(self, before: str) -> int:
        pass


class TokenVault(Protocol):
    """Shared token vault protocol."""

    async def put(self, record: TokenRecord) -> None:
        pass

    async def get(self, token_id: str) -> Optional[TokenRecord]:
        pass

    async def get_by_connection(self, connection_id: str) -> Optional[TokenRecord]:
        pass

    async def rotate_key(self, token_id: str, new_key_ref: str) -> None:
        pass

    async def delete_by_connection(self, connection_id: str) -> None:
        pass


class EncryptedTokenVault(TokenVault, Protocol):
    """Token vault protocol used by flows that rely on encrypted payload storage."""


class OAuthConsentStore(Protocol):
    """Consent persistence protocol."""

    async def put(self, record: OAuthConsentRecord) -> None:
        pass

    async def get(self, consent_id: str) -> Optional[OAuthConsentRecord]:
        pass

    async def list_by_subject(
        self, provider_id: str, subject: OAuthStoredSubject
    ) -> List[OAuthConsentRecord]:
        pass

    async def delete(self, consent_id: str) -> None:
        pass


class OAuthRevocationFailureStore(Protocol):
    """Revocation failure persistence protocol."""

    async def put(self, record: OAuthRevocationFailureRecord) -> None:
        pass

    async def get(self, failure_id: str) -> Optional[OAuthRevocationFailureRecord]:
        pass

    async def list_by_subject(
        self, provider_id: str, subject: OAuthStoredSubject
    ) -> List[OAuthRevocationFailureRecord]:
        pass

    async def delete(self, failure_id: str) -> None:
        pass


class OAuthStateStoreError(Exception):
    """Structured validation error for shared OAuth storage helpers."""

    def __init__(self, code: Literal["VALIDATION_ERROR", "OAUTH_STATE_INVALID"], message: str):
        super().__init__(message)
        self.name = "OAuthStateStoreError"
        self.code = code


def validate_oauth_state_record(record: OAuthStateRecord) -> None:
    """Validate a state record matches the shared OAuth storage contract."""

    if not record.state_id:
        raise OAuthStateStoreError("VALIDATION_ERROR", "stateId is required")
    if not record.provider_id:
        raise OAuthStateStoreError("VALIDATION_ERROR", "providerId is required")
    if not record.redirect_uri:
        raise OAuthStateStoreError("VALIDATION_ERROR", "redirectUri is required")
    if not isinstance(record.requested_scopes, list):
        raise OAuthStateStoreError("VALIDATION_ERROR", "requestedScopes must be an array")

    resolve_oauth_stored_subject(record)
    _assert_iso_timestamp("createdAt", record.created_at)
    _assert_iso_timestamp("expiresAt", record.expires_at)
    if record.consumed_at:
        _assert_iso_timestamp("consumedAt", record.consumed_at)


def validate_oauth_consent_record(record: OAuthConsentRecord) -> None:
    """Validate a consent record matches the shared OAuth storage contract."""

    if not record.consent_id:
        raise OAuthStateStoreError("VALIDATION_ERROR", "consentId is required")
    if not record.provider_id:
        raise OAuthStateStoreError("VALIDATION_ERROR", "providerId is required")
    if not isinstance(record.scopes, list):
        raise OAuthStateStoreError("VALIDATION_ERROR", "scopes must be an array")

    validate_oauth_stored_subject(record.subject)
    _assert_iso_timestamp("grantedAt", record.granted_at)
    _assert_iso_timestamp("updatedAt", record.updated_at)
    if record.metadata is not None and not _is_record(record.metadata):
        raise OAuthStateStoreError("VALIDATION_ERROR", "metadata must be an object")


def validate_oauth_revocation_failure_record(record: OAuthRevocationFailureRecord) -> None:
    """Validate a revocation failure record matches the shared OAuth storage contract."""

    if not record.failure_id:
        raise OAuthStateStoreError("VALIDATION_ERROR", "failureId is required")
    if not record.provider_id:
        raise OAuthStateStoreError("VALIDATION_ERROR", "providerId is required")
    if not record.error_code or not record.error_message:
        raise OAuthStateStoreError(
            "VALIDATION_ERROR", "errorCode and errorMessage are required"
        )

    validate_oauth_stored_subject(record.subject)
    _assert_iso_timestamp("occurredAt", record.occurred_at)
    if record.metadata is not None and not _is_record(record.metadata):
        raise OAuthStateStoreError("VALIDATION_ERROR", "metadata must be an object")


def resolve_oauth_stored_subject(
    record: Union[
        OAuthStateRecord,
        Dict[str, Any],
        BaseModel,
    ]
) -> OAuthStoredSubject:
    """Resolve the canonical stored subject from a state-like payload."""

    payload = record.model_dump(by_alias=True) if isinstance(record, BaseModel) else dict(record)
    subject = payload.get("subject")

    if subject is not None:
        resolved = _model_validate_subject(subject)
        validate_oauth_stored_subject(resolved)
        return resolved

    if payload.get("intentId"):
        resolved = OAuthBrowserAuthSubject.model_validate(
            {
                "kind": "browser-auth",
                "intentId": payload.get("intentId"),
                "tenantId": payload.get("tenantId"),
                "regionId": payload.get("regionId"),
                "returnTo": payload.get("returnTo"),
                "metadata": payload.get("metadata"),
            }
        )
        validate_oauth_stored_subject(resolved)
        return resolved

    if payload.get("tenantId") and payload.get("userId"):
        resolved = OAuthConnectionSubject.model_validate(
            {
                "kind": "connection",
                "tenantId": payload.get("tenantId"),
                "userId": payload.get("userId"),
                "connectionId": payload.get("connectionId"),
            }
        )
        validate_oauth_stored_subject(resolved)
        return resolved

    raise OAuthStateStoreError(
        "VALIDATION_ERROR",
        "subject is required or tenantId/userId or intentId must be provided",
    )


def validate_oauth_stored_subject(subject: OAuthStoredSubject) -> None:
    """Validate a resolved OAuth stored subject."""

    if subject.kind == "connection":
        if not subject.tenant_id or not subject.user_id:
            raise OAuthStateStoreError(
                "VALIDATION_ERROR", "connection subjects require tenantId and userId"
            )
        return

    if subject.kind in ("browser-auth", "browser") and not subject.intent_id:
        raise OAuthStateStoreError(
            "VALIDATION_ERROR", "browser subjects require intentId"
        )
    if subject.metadata is not None and not _is_record(subject.metadata):
        raise OAuthStateStoreError(
            "VALIDATION_ERROR", "browser-auth subject metadata must be an object"
        )


def get_oauth_subject_key(subject: OAuthStoredSubject) -> str:
    """Return the canonical storage key for a subject."""

    if subject.kind == "connection":
        if subject.connection_id:
            return f"connection:{subject.connection_id}"
        return f"connection:{subject.tenant_id}:{subject.user_id}"

    if subject.kind in ("browser-auth", "browser"):
        if not subject.intent_id:
            raise OAuthStateStoreError(
                "VALIDATION_ERROR", "browser subjects require a stable intentId"
            )
        prefix = "browser-auth" if subject.kind == "browser-auth" else "browser"
        return f"{prefix}:{subject.intent_id}"
    raise OAuthStateStoreError(
        "VALIDATION_ERROR", "unsupported OAuth subject kind"
    )


def apply_subject_to_state_record(record: OAuthStateRecord) -> OAuthStateRecord:
    """Copy normalized subject fields back onto a state record."""

    subject = resolve_oauth_stored_subject(record)
    payload = record.model_dump(by_alias=True)
    payload["subject"] = clone_oauth_stored_subject(subject).model_dump(by_alias=True)
    payload["tenantId"] = subject.tenant_id
    payload["userId"] = subject.user_id if isinstance(subject, OAuthConnectionSubject) else None
    payload["connectionId"] = (
        subject.connection_id if isinstance(subject, OAuthConnectionSubject) else None
    )
    payload["intentId"] = subject.intent_id if isinstance(subject, OAuthBrowserAuthSubject) else None
    payload["regionId"] = subject.region_id if isinstance(subject, OAuthBrowserAuthSubject) else None
    payload["returnTo"] = subject.return_to if isinstance(subject, OAuthBrowserAuthSubject) else None
    payload["metadata"] = (
        _clone_unknown_record(subject.metadata)
        if isinstance(subject, OAuthBrowserAuthSubject)
        else _clone_unknown_record(record.metadata)
    )
    return OAuthStateRecord.model_validate(payload)


def clone_oauth_stored_subject(subject: OAuthStoredSubject) -> OAuthStoredSubject:
    """Return a detached copy of a stored subject."""

    return _model_validate_subject(subject.model_dump(by_alias=True))


def is_oauth_state_expired(record: OAuthStateRecord, at: str) -> bool:
    """Return whether a state record is expired at the given timestamp."""

    return _parse_iso_timestamp("expiresAt", record.expires_at) <= _parse_iso_timestamp("at", at)


async def consume_oauth_state(
    store: OAuthStateStore, state_id: str, consumed_at: str
) -> Optional[OAuthStateRecord]:
    """Consume a state record and validate the resulting payload."""

    if not state_id:
        raise OAuthStateStoreError("VALIDATION_ERROR", "stateId is required")
    _assert_iso_timestamp("consumedAt", consumed_at)

    consumed = await store.consume(state_id, consumed_at)
    if consumed is None:
        return None

    validate_oauth_state_record(consumed)
    return clone_oauth_state_record(consumed)


async def purge_expired_oauth_states(store: OAuthStateStore, before: str) -> int:
    """Delete all states older than the provided timestamp."""

    _assert_iso_timestamp("before", before)
    return await store.delete_expired(before)


def clone_oauth_state_record(record: OAuthStateRecord) -> OAuthStateRecord:
    """Return a detached, normalized clone of a state record."""

    normalized = apply_subject_to_state_record(record)
    payload = normalized.model_dump(by_alias=True)
    payload["requestedScopes"] = list(normalized.requested_scopes)
    payload["metadata"] = _clone_unknown_record(normalized.metadata)
    return OAuthStateRecord.model_validate(payload)


def _model_validate_subject(value: Any) -> OAuthStoredSubject:
    if isinstance(value, (OAuthConnectionSubject, OAuthBrowserAuthSubject)):
        return value

    payload = dict(value)
    if payload.get("kind") == "connection":
        return OAuthConnectionSubject.model_validate(payload)
    if payload.get("kind") in ("browser-auth", "browser"):
        return OAuthBrowserAuthSubject.model_validate(payload)
    raise OAuthStateStoreError("VALIDATION_ERROR", "subject kind must be connection, browser-auth, or browser")


def _assert_iso_timestamp(field_name: str, value: str) -> None:
    _parse_iso_timestamp(field_name, value)


def _parse_iso_timestamp(field_name: str, value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError as exc:
        raise OAuthStateStoreError(
            "VALIDATION_ERROR", f"{field_name} must be a valid ISO-8601 timestamp"
        ) from exc


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _clone_unknown_record(
    value: Optional[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    return dict(value) if value is not None else None


__all__ = [
    "EncryptedTokenVault",
    "OAuthBrowserAuthSubject",
    "OAuthConnectionSubject",
    "OAuthConsentRecord",
    "OAuthConsentStore",
    "OAuthRevocationFailureRecord",
    "OAuthRevocationFailureStore",
    "OAuthStateRecord",
    "OAuthStateStore",
    "OAuthStateStoreError",
    "OAuthStorageFieldDefinition",
    "OAuthStorageIndexDefinition",
    "OAuthStorageTableDefinition",
    "OAuthStoredSubject",
    "TokenRecord",
    "TokenVault",
    "apply_subject_to_state_record",
    "clone_oauth_state_record",
    "clone_oauth_stored_subject",
    "consume_oauth_state",
    "get_oauth_subject_key",
    "is_oauth_state_expired",
    "purge_expired_oauth_states",
    "resolve_oauth_stored_subject",
    "validate_oauth_consent_record",
    "validate_oauth_revocation_failure_record",
    "validate_oauth_state_record",
    "validate_oauth_stored_subject",
]
