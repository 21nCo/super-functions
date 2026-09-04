"""Shared HTTP route construction and envelope helpers for authfn Python."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, cast
from urllib.parse import parse_qs, urlparse

from superfunctions.http import HttpMethod, Response, Route, RouteContext, SetCookie

from .config import get_plugin_config, resolve_runtime
from .errors import to_authfn_error
from .observability import (
    emit_auth_event,
    event_request_id,
)
from .observability import (
    resolve_request_id as resolve_observability_request_id,
)
from .plugins.api_keys import ApiKeyPluginConfig, ApiKeyService
from .plugins.email_otp import EmailOtpPluginConfig, EmailOtpService
from .plugins.gateway_routing import create_cell_routing_middleware
from .plugins.multi_region import MultiRegionPluginConfig, MultiRegionService
from .plugins.two_factor import TwoFactorPluginConfig, TwoFactorService
from .types import (
    AuthFnConfig,
    AuthFnError,
    AuthFnHookContext,
    AuthFnSession,
    ConflictError,
    CsrfInvalidError,
    InternalError,
    InvalidCredentialsError,
    NotFoundError,
    PluginAbortedError,
    SessionExpiredError,
    SessionRevokedError,
    UnauthorizedError,
    ValidationError,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)

DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
DEFAULT_CSRF_MAX_AGE_SECONDS = DEFAULT_SESSION_MAX_AGE_SECONDS
PASSWORD_HASH_ALGO = "scrypt"
PASSWORD_HASH_N = 16384
PASSWORD_HASH_R = 8
PASSWORD_HASH_P = 1
PASSWORD_HASH_KEY_LENGTH = 64
MIN_PASSWORD_LENGTH = 12
