"""Shared pytest fixtures for the sendfn release gate suite."""

from __future__ import annotations

import builtins
import sys
from collections.abc import Callable, Iterable
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SENDfn_PYTHON_DIR = REPO_ROOT / "sendfn" / "python"


def _clear_modules(prefixes: Iterable[str]) -> None:
    targets = tuple(prefixes)
    for module_name in list(sys.modules):
        if module_name in targets or module_name.startswith(tuple(f"{target}." for target in targets)):
            sys.modules.pop(module_name, None)


@pytest.fixture
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture
def python_readme_text() -> str:
    return (SENDfn_PYTHON_DIR / "README.md").read_text(encoding="utf-8")


@pytest.fixture
def python_pyproject_text() -> str:
    return (SENDfn_PYTHON_DIR / "pyproject.toml").read_text(encoding="utf-8")


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
