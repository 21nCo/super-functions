"""Placement-bound auth context for trusted AuthFn consumers."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import inspect
import ipaddress
import json
import secrets
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple, TypeGuard, cast
from urllib.parse import unquote, urlparse

import idna
from idna import idnadata

from ..http import _coerce_utc, _hash_secret, get_cookie_session_state
from ..observability import emit_auth_event, resolve_request_id
from ..plugins.gateway_routing import (
    IdentityPlacement,
    IdentityPlacementDirectory,
    RoutingKeyring,
    RoutingSigningKey,
)
from ..types import (
    ApiKeyRevokedError,
    AuthFnConfig,
    ConfigError,
    ExpiredCredentialsError,
    PlacementContextInvalidError,
    PlacementDirectoryUnavailableError,
    PlacementMovingError,
    RegionNotFoundError,
    SessionExpiredError,
    SessionRevokedError,
    UnauthorizedError,
    ValidationError,
)

CONTEXT_KIND = "placement-context"
INTERNAL_HEADER_PREFIX = "x-authfn-routing-"
DEFAULT_TTL_SECONDS = 60
MAX_TTL_SECONDS = 300
AUTH_REQUIRED = "Authentication required"
SESSION_EXPIRED = "Session expired"
SESSION_REVOKED = "Session revoked"
INVALID_AUTHORITY = "AuthFn publicAuthority must be a valid origin"
