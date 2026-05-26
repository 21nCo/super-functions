"""Repo-root Python shim for PlugFn imports during local development."""

from pathlib import Path
from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)

_IMPLEMENTATION_DIR = Path(__file__).resolve().parent / "python" / "plugfn"
if _IMPLEMENTATION_DIR.is_dir():
    implementation_path = str(_IMPLEMENTATION_DIR)
    if implementation_path not in __path__:
        __path__.append(implementation_path)

from .core.plug_fn import PlugFn, PlugFnConfig  # type: ignore[attr-defined]
from .types import (  # type: ignore[attr-defined]
    AuthProvider,
    AuthType,
    Connection,
    ConnectionStatus,
    DatabaseAdapter,
    Provider,
    Workflow,
    WorkflowStatus,
)

__version__ = "0.1.0"
__author__ = "SuperFunctions"
__license__ = "Apache-2.0"

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
