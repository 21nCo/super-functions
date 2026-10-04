"""Shared pytest fixtures for the sendfn release gate suite."""

from __future__ import annotations

import builtins
import sys
from collections.abc import Callable, Iterable

import pytest

def _clear_modules(prefixes: Iterable[str]) -> None:
    targets = tuple(prefixes)
    for module_name in list(sys.modules):
        if module_name in targets or module_name.startswith(tuple(f"{target}." for target in targets)):
            sys.modules.pop(module_name, None)


@pytest.fixture
def block_imports(monkeypatch: pytest.MonkeyPatch) -> Callable[[Iterable[str]], None]:
    real_import = builtins.__import__

    def apply(names: Iterable[str]) -> None:
        blocked = tuple(names)
        _clear_modules(blocked)

        def fake_import(name: str, globals=None, locals=None, fromlist=(), level=0):
            root_name = name.split(".")[0]
            if name in blocked or root_name in blocked:
                raise ImportError(f"No module named '{name}'")
            return real_import(name, globals, locals, fromlist, level)

        monkeypatch.setattr(builtins, "__import__", fake_import)

    return apply
