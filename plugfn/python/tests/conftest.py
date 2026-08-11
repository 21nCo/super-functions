"""Pytest bootstrap for repo-root PlugFn Python test execution."""

import sys
from pathlib import Path

PYTHON_PACKAGE_ROOT = Path(__file__).resolve().parents[1]

if str(PYTHON_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_PACKAGE_ROOT))
