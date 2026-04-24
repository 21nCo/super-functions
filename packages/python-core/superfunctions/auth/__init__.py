"""Shared auth abstractions for the superfunctions ecosystem."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

from pydantic import BaseModel, Field, ValidationError

from superfunctions.http import Request


class AuthValidationError(Exception):
    """Structured validation error for shared auth payloads."""

    def __init__(self, message: str = "Invalid auth payload", details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.code = "AUTH_VALIDATION_ERROR"
        self.status = 400
        self.details = details or {}


class AuthSubject(BaseModel):
    """Actor information attached to an authenticated session."""

    actor_id: str = Field(alias="actorId")
    actor_type: str = Field(alias="actorType")
    tenant_id: Optional[str] = Field(None, alias="tenantId")
    region_id: Optional[str] = Field(None, alias="regionId")
    email: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class AuthSession(BaseModel):
    """Actor-centric shared auth session."""

    id: str
    type: str
    subject: AuthSubject
    resource_ids: Optional[List[str]] = Field(None, alias="resourceIds")
    scopes: Optional[List[str]] = None
    methods: Optional[List[str]] = None
    expires_at: Optional[datetime] = Field(None, alias="expiresAt")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class AuthContext(BaseModel):
    """Optional client-side auth context."""

    user_id: str = Field(alias="userId")
    tenant_id: Optional[str] = Field(None, alias="tenantId")
    region_id: Optional[str] = Field(None, alias="regionId")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


@runtime_checkable
class AuthProvider(Protocol):
    """Framework-agnostic auth provider protocol."""

    async def authenticate(self, request: Request) -> Optional[AuthSession]:
        pass

    async def authorize(self, session: AuthSession, resource_id: str) -> bool:
        pass

    async def revoke(self, session_id: str) -> None:
        pass


def validate_auth_subject(value: Dict[str, Any]) -> AuthSubject:
    """Validate and normalize an auth subject."""

    try:
        subject = AuthSubject.model_validate(value)
    except ValidationError as exc:
        raise AuthValidationError("Invalid auth subject", {"errors": exc.errors()}) from exc

    if subject.actor_type not in {"user", "api-key", "service"}:
        raise AuthValidationError("Invalid auth subject", {"actorType": subject.actor_type})

    return subject


def validate_auth_session(value: Dict[str, Any]) -> AuthSession:
    """Validate and normalize an auth session."""

    try:
        session = AuthSession.model_validate(value)
    except ValidationError as exc:
        raise AuthValidationError("Invalid auth session", {"errors": exc.errors()}) from exc

    validate_auth_subject(session.subject.model_dump(by_alias=True))
    return session


__all__ = [
    "AuthValidationError",
    "AuthSubject",
    "AuthSession",
    "AuthContext",
    "AuthProvider",
    "validate_auth_subject",
    "validate_auth_session",
]
