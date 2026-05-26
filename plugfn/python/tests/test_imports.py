"""Import and parity-baseline tests for the PlugFn Python package."""

import importlib


def test_package_imports_cleanly():
    module = importlib.import_module("plugfn")

    assert hasattr(module, "PlugFn")
    assert hasattr(module, "PlugFnConfig")


def test_provider_exports_load_without_undeclared_field_mutation():
    providers = importlib.import_module("plugfn.providers")

    assert providers.github_provider.name == "github"
    assert providers.github_provider.auth_config is not None
    assert "issues.create" in providers.github_provider.actions
    assert "issues.opened" in providers.github_provider.triggers

    assert providers.slack_provider.name == "slack"
    assert providers.slack_provider.auth_config is not None
    assert "chat.postMessage" in providers.slack_provider.actions
    assert "message" in providers.slack_provider.triggers

    assert set(providers.CORE_PROVIDER_EXPORTS.keys()) == {
        "github",
        "linear",
        "clickup",
        "gmail",
    }
    assert set(providers.ADJACENT_EXPERIMENTAL_PROVIDER_EXPORTS.keys()) == {"slack"}
