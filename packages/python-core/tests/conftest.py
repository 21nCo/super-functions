"""Test configuration for python-core shared-package tests."""

from __future__ import annotations

import os
import sys

TESTS_DIR = os.path.dirname(__file__)
PYTHON_CORE_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))

if PYTHON_CORE_ROOT not in sys.path:
    sys.path.insert(0, PYTHON_CORE_ROOT)
