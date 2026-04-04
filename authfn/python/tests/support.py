from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List, Optional


TESTS_DIR = os.path.dirname(__file__)
AUTHFN_PYTHON_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
PYTHON_CORE_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-core")
)
PYTHON_FASTAPI_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-fastapi")
)
PYTHON_FLASK_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-flask")
)

for path in (AUTHFN_PYTHON_ROOT, PYTHON_CORE_ROOT, PYTHON_FASTAPI_ROOT, PYTHON_FLASK_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from superfunctions.http import RouteContext


class InMemoryDatabaseAdapter:
    def __init__(self) -> None:
        self.storage: Dict[str, List[Dict[str, Any]]] = {}

    async def find_one(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: str,
    ) -> Optional[Dict[str, Any]]:
        for row in self.storage.get(model, []):
            if _matches(row, where):
                return row
        return None

    async def find_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        order_by: Optional[List[Dict[str, Any]]] = None,
        namespace: str = "authfn",
    ) -> List[Dict[str, Any]]:
        rows = [row for row in self.storage.get(model, []) if _matches(row, where)]
        if order_by:
            for entry in reversed(order_by):
                reverse = entry.get("direction") == "desc"
                rows.sort(key=lambda item: item.get(entry["field"]), reverse=reverse)
        return rows

    async def create(self, model: str, data: Dict[str, Any], namespace: str) -> Dict[str, Any]:
        self.storage.setdefault(model, []).append(dict(data))
        return self.storage[model][-1]

    async def update(
        self,
        model: str,
        where: List[Dict[str, Any]],
        data: Dict[str, Any],
        namespace: str,
    ) -> Dict[str, Any]:
        for row in self.storage.get(model, []):
            if _matches(row, where):
                row.update(data)
                return row
        raise AssertionError(f"row not found in {model}: {where}")

    async def delete_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: str,
    ) -> int:
        rows = self.storage.get(model, [])
        kept = [row for row in rows if not _matches(row, where)]
        deleted = len(rows) - len(kept)
        self.storage[model] = kept
        return deleted


class TestRequest:
    __test__ = False

    def __init__(
        self,
        method: str,
        url: str,
        *,
        body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.method = method
        self.url = url
        self.path = url.split("://", 1)[-1].split("/", 1)[-1]
        self.path = "/" + self.path.split("?", 1)[0] if self.path else "/"
        self._body = body
        self._headers = {k: v for k, v in (headers or {}).items()}

    @property
    def headers(self) -> Dict[str, str]:
        return self._headers

    @property
    def query_params(self) -> Dict[str, Any]:
        query = self.url.split("?", 1)[1] if "?" in self.url else ""
        params: Dict[str, Any] = {}
        for piece in query.split("&"):
            if not piece:
                continue
            key, _, value = piece.partition("=")
            params[key] = value
        return params

    async def json(self) -> Any:
        return self._body

    async def body(self) -> bytes:
        if self._body is None:
            return b""
        return json.dumps(self._body).encode("utf-8")

    async def text(self) -> str:
        if self._body is None:
            return ""
        return json.dumps(self._body)


def build_context(url: str, method: str, params: Optional[Dict[str, str]] = None) -> RouteContext:
    return RouteContext(
        params=params or {},
        query={},
        headers={},
        url=url,
        method=method,
    )


def response_cookie_header_map(response: Any) -> Dict[str, str]:
    return {cookie.name: cookie.value for cookie in response.cookies}


def _matches(row: Dict[str, Any], where: List[Dict[str, Any]]) -> bool:
    for clause in where:
        operator = clause["operator"]
        field = clause["field"]
        value = clause["value"]
        candidate = row.get(field)
        if operator == "eq" and candidate != value:
            return False
        if operator == "lt" and not (candidate < value):
            return False
        if operator == "contains":
            if not isinstance(candidate, list) or value not in candidate:
                return False
    return True
