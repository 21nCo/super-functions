"""Framework adapters for PlugFn."""

from typing import Any, Callable, Optional

# Adapters are imported conditionally based on available frameworks
__all__: list[str] = []

mount_plugfn_fastapi: Optional[Callable[..., Any]]
mount_plugfn_flask: Optional[Callable[..., Any]]

try:
    from .fastapi import mount_plugfn as _mount_plugfn_fastapi

    mount_plugfn_fastapi = _mount_plugfn_fastapi
    __all__.append("mount_plugfn_fastapi")
except ImportError:
    mount_plugfn_fastapi = None

try:
    from .flask import mount_plugfn as _mount_plugfn_flask

    mount_plugfn_flask = _mount_plugfn_flask
    __all__.append("mount_plugfn_flask")
except ImportError:
    mount_plugfn_flask = None
