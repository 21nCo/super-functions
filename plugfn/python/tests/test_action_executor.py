"""Action executor middleware tests."""

from types import SimpleNamespace
from typing import Any, Dict, Optional

import httpx
import pytest

from plugfn.core.action_executor import (
    ActionExecutor,
    InMemoryRateLimiter,
    RateLimitExceededError,
)
from plugfn.types import AuthType


class MockConnectionManager:
    """Provide one active connection and static credentials."""

    async def get_connection(self, connection_id: str) -> Any:
        return SimpleNamespace(
            id=connection_id,
            user_id="user-1",
            provider="test-provider",
        )

    async def update_last_used(self, _connection_id: str) -> None:
        return None

    async def get_credentials(self, _connection_id: str) -> Dict[str, Any]:
        return {}


class RecordingAction:
    """Record invocations and expose the HTTP timeout to assertions."""

    def __init__(self, failures: int = 0, *, idempotent: bool = True) -> None:
        self.calls = 0
        self.failures = failures
        self.idempotent = idempotent

    async def execute(self, _params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        self.calls += 1
        if self.calls <= self.failures:
            raise httpx.ConnectError("temporary failure")
        return {"timeout": context.http.timeout}


class MockLogger:
    """Satisfy the executor logger contract."""

    def warn(self, _message: str, _metadata: Dict[str, Any]) -> None:
        return None


def create_executor(
    action: RecordingAction,
    *,
    rate_limit: Optional[Dict[str, int]] = None,
    enable_rate_limit: bool = True,
    enable_retry: bool = False,
    retry_options: Optional[Dict[str, Any]] = None,
) -> ActionExecutor:
    provider = SimpleNamespace(
        name="test-provider",
        base_url="https://provider.example.com",
        auth_type=AuthType.NONE,
        actions={"records.list": action},
        rate_limit=rate_limit,
    )
    registry = SimpleNamespace(get_provider=lambda _name: provider)
    return ActionExecutor(
        MockConnectionManager(),
        registry,
        MockLogger(),
        enable_retry=enable_retry,
        enable_rate_limit=enable_rate_limit,
        retry_options=retry_options,
    )


@pytest.mark.asyncio
async def test_action_timeout_is_forwarded_to_http_client() -> None:
    action = RecordingAction()
    executor = create_executor(action, enable_rate_limit=False)

    result = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
        timeout=7,
    )

    assert result["success"] is True
    assert result["data"] == {"timeout": 7}


@pytest.mark.asyncio
async def test_enabled_provider_rate_limit_rejects_excess_actions() -> None:
    action = RecordingAction()
    executor = create_executor(action, rate_limit={"requests": 1, "window": 60_000})

    first = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
    )
    second = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
    )

    assert first["success"] is True
    assert second["success"] is False
    assert isinstance(second["error"], RateLimitExceededError)
    assert action.calls == 1


@pytest.mark.asyncio
async def test_explicit_cache_reuses_successful_action_result() -> None:
    action = RecordingAction()
    executor = create_executor(action, enable_rate_limit=False)

    first = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {"page": 1},
        connection_id="connection-1",
        cache=True,
    )
    second = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {"page": 1},
        connection_id="connection-1",
        cache=True,
    )

    assert first["cached"] is False
    assert second["cached"] is True
    assert action.calls == 1


@pytest.mark.asyncio
async def test_dictionary_cache_options_honor_enabled_and_custom_key() -> None:
    action = RecordingAction()
    executor = create_executor(action, enable_rate_limit=False)

    first = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {"page": 1},
        connection_id="connection-1",
        cache={"enabled": True, "key": "records"},
    )
    second = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {"page": 2},
        connection_id="connection-1",
        cache={"enabled": True, "key": "records"},
    )

    assert first["cached"] is False
    assert second["cached"] is True
    assert action.calls == 1


@pytest.mark.asyncio
async def test_dictionary_cache_options_honor_disabled() -> None:
    action = RecordingAction()
    executor = create_executor(action, enable_rate_limit=False)

    for _ in range(2):
        result = await executor.execute(
            "test-provider",
            "records.list",
            "user-1",
            {},
            connection_id="connection-1",
            cache={"enabled": False},
        )
        assert result["cached"] is False

    assert action.calls == 2


@pytest.mark.asyncio
async def test_dictionary_cache_options_honor_zero_ttl() -> None:
    action = RecordingAction()
    executor = create_executor(action, enable_rate_limit=False)

    primed = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
        cache=True,
    )
    assert primed["cached"] is False

    for _ in range(2):
        result = await executor.execute(
            "test-provider",
            "records.list",
            "user-1",
            {},
            connection_id="connection-1",
            cache={"enabled": True, "ttl": 0},
        )
        assert result["cached"] is False

    assert action.calls == 3


@pytest.mark.asyncio
async def test_enabled_retry_uses_default_attempts_without_per_call_options() -> None:
    action = RecordingAction(failures=2)
    executor = create_executor(
        action,
        enable_rate_limit=False,
        enable_retry=True,
        retry_options={"delay": 0},
    )

    result = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
    )

    assert result["success"] is True
    assert action.calls == 3


@pytest.mark.asyncio
async def test_retry_skips_non_idempotent_actions_by_default() -> None:
    action = RecordingAction(failures=1, idempotent=False)
    executor = create_executor(
        action,
        enable_rate_limit=False,
        enable_retry=True,
        retry_options={"delay": 0},
    )

    result = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
    )

    assert result["success"] is False
    assert action.calls == 1


@pytest.mark.asyncio
async def test_retry_stops_on_non_transient_errors() -> None:
    action = RecordingAction()

    async def fail_validation(_params: Dict[str, Any], _context: Any) -> Dict[str, Any]:
        action.calls += 1
        raise ValueError("invalid input")

    action.execute = fail_validation  # type: ignore[assignment]
    executor = create_executor(
        action,
        enable_rate_limit=False,
        enable_retry=True,
        retry_options={"delay": 0},
    )

    result = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
    )

    assert result["success"] is False
    assert action.calls == 1


@pytest.mark.asyncio
async def test_rate_limiter_prunes_expired_bucket_keys() -> None:
    times = iter([0.0, 2.0])
    limiter = InMemoryRateLimiter(now=lambda: next(times))

    await limiter.acquire(["old-user"], requests=1, window_ms=1000)
    await limiter.acquire(["current-user"], requests=1, window_ms=1000)

    assert "old-user" not in limiter._buckets
    assert all(item[2] != "old-user" for item in limiter._expiry_heap)


@pytest.mark.asyncio
async def test_uncopyable_cache_result_does_not_fail_successful_action() -> None:
    class Uncopyable:
        def __deepcopy__(self, _memo: Dict[int, Any]) -> Any:
            raise TypeError("cannot copy")

    action = RecordingAction()

    async def return_uncopyable(_params: Dict[str, Any], _context: Any) -> Dict[str, Any]:
        action.calls += 1
        return {"value": Uncopyable()}

    action.execute = return_uncopyable  # type: ignore[assignment]
    executor = create_executor(action, enable_rate_limit=False)

    first = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
        cache=True,
    )
    second = await executor.execute(
        "test-provider",
        "records.list",
        "user-1",
        {},
        connection_id="connection-1",
        cache=True,
    )

    assert first["success"] is True
    assert second["success"] is True
    assert action.calls == 2
