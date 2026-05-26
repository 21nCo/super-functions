"""
PlugFn - Self-hosted integration platform for Python applications.

Example usage:
    >>> from plugfn import PlugFn
    >>> from plugfn.providers import github_provider
    >>>
    >>> plug = PlugFn(
    ...     database=adapter,
    ...     auth=auth_provider,
    ...     base_url="https://myapp.com",
    ...     encryption_key="your-key",
    ...     integrations={"github": {...}}
    ... )
    >>> plug.providers.register(github_provider)
    >>> issue = await plug.github.issues.create(user_id="user-123", params={...})
"""

__version__ = "0.0.1"
__author__ = "SuperFunctions"
__license__ = "Apache-2.0"

from .core.plug_fn import PlugFn, PlugFnConfig
from .types import (
    AuthType,
    ConnectionStatus,
    WorkflowStatus,
    Connection,
    Workflow,
    Provider,
    DatabaseAdapter,
    AuthProvider,
)

__all__ = [
    "__version__",
    "PlugFn",
    "PlugFnConfig",
    "AuthType",
    "ConnectionStatus",
    "WorkflowStatus",
    "Connection",
    "Workflow",
    "Provider",
    "DatabaseAdapter",
    "AuthProvider",
]
