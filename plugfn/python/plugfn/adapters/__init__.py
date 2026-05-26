"""Framework adapters for PlugFn."""

# Adapters are imported conditionally based on available frameworks
__all__ = []

try:
    from .fastapi import mount_plugfn as mount_plugfn_fastapi
    __all__.append("mount_plugfn_fastapi")
except ImportError:
    mount_plugfn_fastapi = None

try:
    from .flask import mount_plugfn as mount_plugfn_flask
    __all__.append("mount_plugfn_flask")
except ImportError:
    mount_plugfn_flask = None
