"""Token store for temporary OAuth state management."""

import time
from typing import Dict, Optional


class TokenStore:
    """Abstract token store interface."""

    async def set(self, key: str, value: str, ttl: int = 600) -> None:
        """Set a key-value pair with optional TTL.

        Args:
            key: Key
            value: Value
            ttl: Time to live in seconds
        """
        raise NotImplementedError

    async def get(self, key: str) -> Optional[str]:
        """Get a value by key.

        Args:
            key: Key

        Returns:
            Value or None if not found
        """
        raise NotImplementedError

    async def delete(self, key: str) -> None:
        """Delete a key.

        Args:
            key: Key
        """
        raise NotImplementedError


class MemoryTokenStore(TokenStore):
    """In-memory token store implementation."""

    def __init__(self) -> None:
        """Initialize memory token store."""
        self._store: Dict[str, tuple[str, float]] = {}

    async def set(self, key: str, value: str, ttl: int = 600) -> None:
        """Set a key-value pair with TTL.

        Args:
            key: Key
            value: Value
            ttl: Time to live in seconds
        """
        expiry = time.time() + ttl
        self._store[key] = (value, expiry)

    async def get(self, key: str) -> Optional[str]:
        """Get a value by key.

        Args:
            key: Key

        Returns:
            Value or None if not found or expired
        """
        if key not in self._store:
            return None

        value, expiry = self._store[key]

        # Check if expired
        if time.time() > expiry:
            del self._store[key]
            return None

        return value

    async def delete(self, key: str) -> None:
        """Delete a key.

        Args:
            key: Key
        """
        if key in self._store:
            del self._store[key]

    def cleanup_expired(self) -> None:
        """Remove expired entries."""
        now = time.time()
        expired_keys = [k for k, (_, expiry) in self._store.items() if now > expiry]

        for key in expired_keys:
            del self._store[key]
