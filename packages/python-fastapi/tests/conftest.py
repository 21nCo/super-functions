"""Test configuration for python-fastapi adapter tests."""

from __future__ import annotations

import os
import sys


TESTS_DIR = os.path.dirname(__file__)
FASTAPI_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
PYTHON_CORE_ROOT = os.path.abspath(os.path.join(TESTS_DIR, "..", "..", "python-core"))

for path in (FASTAPI_ROOT, PYTHON_CORE_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)
