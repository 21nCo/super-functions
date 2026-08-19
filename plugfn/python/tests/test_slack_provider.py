"""Slack action response contract tests."""

from types import SimpleNamespace
from typing import Any, Dict

import pytest

from plugfn.providers import slack_provider


class SlackHttpStub:
    """Return the same Slack envelope for GET and POST calls."""

    def __init__(self, response: Dict[str, Any]) -> None:
        self.response = response

    async def get(self, *_args: Any, **_kwargs: Any) -> Dict[str, Any]:
        return self.response

    async def post(self, *_args: Any, **_kwargs: Any) -> Dict[str, Any]:
        return self.response


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("action_name", "params"),
    [
        ("chat.postMessage", {"channel": "C123", "text": "hello"}),
        ("conversations.create", {"name": "general"}),
        ("users.info", {"user": "U123"}),
    ],
)
async def test_slack_actions_reject_http_200_error_envelopes(
    action_name: str, params: Dict[str, Any]
) -> None:
    context = SimpleNamespace(http=SlackHttpStub({"ok": False, "error": "invalid_auth"}))

    with pytest.raises(ValueError, match="Slack API request failed: invalid_auth"):
        await slack_provider.actions[action_name].execute(params, context)
