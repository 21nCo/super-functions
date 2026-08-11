"""Provider implementations for PlugFn."""

from .clickup import clickup_provider
from .github import github_provider
from .gmail import gmail_provider
from .linear import linear_provider
from .slack import slack_provider

CORE_PROVIDER_EXPORTS = {
    "github": github_provider,
    "linear": linear_provider,
    "clickup": clickup_provider,
    "gmail": gmail_provider,
}

ADJACENT_EXPERIMENTAL_PROVIDER_EXPORTS = {
    "slack": slack_provider,
}

ALL_PROVIDER_EXPORTS = {
    **CORE_PROVIDER_EXPORTS,
    **ADJACENT_EXPERIMENTAL_PROVIDER_EXPORTS,
}

__all__ = [
    "github_provider",
    "linear_provider",
    "clickup_provider",
    "gmail_provider",
    "slack_provider",
    "CORE_PROVIDER_EXPORTS",
    "ADJACENT_EXPERIMENTAL_PROVIDER_EXPORTS",
    "ALL_PROVIDER_EXPORTS",
]
