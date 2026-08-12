"""Action executor middleware tests."""

from types import SimpleNamespace
from typing import Any, Dict, Optional

import pytest

from plugfn.core.action_executor import ActionExecutor, RateLimitExceededError
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

    def __init__(self) -> None:
        self.calls = 0

    async def execute(self, _params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        self.calls += 1
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
        enable_retry=False,
        enable_rate_limit=enable_rate_limit,
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
