"""Core provider parity tests for PlugFn Python."""

from types import SimpleNamespace

import pytest

from plugfn.providers import (
    ADJACENT_EXPERIMENTAL_PROVIDER_EXPORTS,
    ALL_PROVIDER_EXPORTS,
    CORE_PROVIDER_EXPORTS,
    clickup_provider,
    github_provider,
    gmail_provider,
    linear_provider,
    slack_provider,
)


def test_core_provider_exports_resolve():
    assert github_provider.name == "github"
    assert linear_provider.name == "linear"
    assert clickup_provider.name == "clickup"
    assert gmail_provider.name == "gmail"

    assert set(CORE_PROVIDER_EXPORTS.keys()) == {"github", "linear", "clickup", "gmail"}
    assert set(ALL_PROVIDER_EXPORTS.keys()) >= {
        "github",
        "linear",
        "clickup",
        "gmail",
        "slack",
    }


def test_adjacent_provider_exports_remain_explicit():
    assert ADJACENT_EXPERIMENTAL_PROVIDER_EXPORTS == {"slack": slack_provider}


def test_core_providers_expose_basic_action_and_trigger_contracts():
    contracts = {
        "github": (github_provider, "issues.get", "issues.opened"),
        "linear": (linear_provider, "issues.get", "issue.updated"),
        "clickup": (clickup_provider, "tasks.get", "task.updated"),
        "gmail": (gmail_provider, "mail.sync", "mail.update"),
    }

    for provider_name, (provider, action_name, trigger_name) in contracts.items():
        assert provider.name == provider_name
        assert provider.auth_config is not None
        assert action_name in provider.actions
        assert trigger_name in provider.triggers
        assert provider.actions[action_name].name == action_name
        assert provider.triggers[trigger_name]["name"] == trigger_name


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("action_name", "params"),
    [
        ("issues.get", {"issue_id": "issue-1"}),
        ("issues.search", {"team_id": "team-1"}),
    ],
)
async def test_linear_actions_raise_graphql_errors(action_name, params):
    class ErrorHttp:
        async def post(self, *_args, **_kwargs):
            return {"errors": [{"message": "not authorized"}], "data": None}

    context = SimpleNamespace(http=ErrorHttp())

    with pytest.raises(RuntimeError, match="Linear GraphQL request failed"):
        await linear_provider.actions[action_name].execute(params, context)


@pytest.mark.asyncio
async def test_linear_get_rejects_missing_issue_data():
    class MissingDataHttp:
        async def post(self, *_args, **_kwargs):
            return {"data": {"issue": None}}

    context = SimpleNamespace(http=MissingDataHttp())

    with pytest.raises(RuntimeError, match=r"missing data\.issue"):
        await linear_provider.actions["issues.get"].execute(
            {"issue_id": "missing"}, context
        )
