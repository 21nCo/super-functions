import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter


# Schema with field-level permissions
SCHEMA_WITH_PERMISSIONS = {
    "resources": [
        {
            "name": "employees",
            "version": 1,
            "fields": [
                {"name": "name", "type": "string"},
                {"name": "email", "type": "string"},
                {"name": "salary", "type": "number"},
                {"name": "ssn", "type": "string"},
            ],
            "permissions": {
                "read": {
                    "fields": ["id", "name", "email"]
                },
                "write": {
                    "fields": ["name", "email"]
                }
            }
        },
        {
            "name": "tasks",
            "version": 1,
            "fields": [
                {"name": "title", "type": "string"},
                {"name": "status", "type": "string"},
            ]
        },
        {
            "name": "__datafn_idempotency",
            "fields": [
                {"name": "clientId"},
                {"name": "mutationId"},
                {"name": "result"}
            ]
        },
    ],
    "relations": []
}


def _make_server():
    db = MockAdapter()
    server = create_datafn_server({"schema": SCHEMA_WITH_PERMISSIONS, "db": db})
    return server, db


@pytest.mark.asyncio
async def test_query_unauthorized_field_returns_forbidden():
    """TV-AUTH-001: Query selecting unauthorized field returns FORBIDDEN."""
    server, db = _make_server()
    query_handler = server["routes"]["POST /datafn/query"]

    res = await query_handler({}, {
        "resource": "employees",
        "version": 1,
        "select": ["id", "salary"]
    })
    assert res["ok"] is False
    assert res["error"]["code"] == "FORBIDDEN"
    assert "salary" in res["error"]["message"]


@pytest.mark.asyncio
async def test_query_authorized_fields_succeed():
    """Query selecting only authorized fields succeeds."""
    server, db = _make_server()
    query_handler = server["routes"]["POST /datafn/query"]

    res = await query_handler({}, {
        "resource": "employees",
        "version": 1,
        "select": ["id", "name", "email"]
    })
    assert res["ok"] is True


@pytest.mark.asyncio
async def test_query_no_permissions_all_fields_accessible():
    """When no permissions are defined, all fields are accessible."""
    server, db = _make_server()
    query_handler = server["routes"]["POST /datafn/query"]

    res = await query_handler({}, {
        "resource": "tasks",
        "version": 1,
        "select": ["id", "title", "status"]
    })
    assert res["ok"] is True


@pytest.mark.asyncio
async def test_query_id_always_readable():
    """id is always readable even if not explicitly in permissions."""
    server, db = _make_server()
    query_handler = server["routes"]["POST /datafn/query"]

    res = await query_handler({}, {
        "resource": "employees",
        "version": 1,
        "select": ["id"]
    })
    assert res["ok"] is True


@pytest.mark.asyncio
async def test_mutation_unauthorized_field_returns_forbidden():
    """Mutation writing unauthorized field returns FORBIDDEN."""
    server, db = _make_server()
    mutation_handler = server["routes"]["POST /datafn/mutation"]

    res = await mutation_handler({}, {
        "resource": "employees",
        "version": 1,
        "operation": "insert",
        "id": "emp1",
        "record": {"name": "Alice", "salary": 100000}
    })
    assert res["ok"] is False
    assert res["error"]["code"] == "FORBIDDEN"
    assert "salary" in res["error"]["message"]


@pytest.mark.asyncio
async def test_mutation_authorized_fields_succeed():
    """Mutation writing only authorized fields succeeds."""
    server, db = _make_server()
    mutation_handler = server["routes"]["POST /datafn/mutation"]

    res = await mutation_handler({}, {
        "resource": "employees",
        "version": 1,
        "operation": "insert",
        "id": "emp1",
        "record": {"name": "Alice", "email": "alice@example.com"}
    })
    assert res["ok"] is True


@pytest.mark.asyncio
async def test_query_filter_unauthorized_field_forbidden():
    """Filtering on unauthorized field returns FORBIDDEN."""
    server, db = _make_server()
    query_handler = server["routes"]["POST /datafn/query"]

    res = await query_handler({}, {
        "resource": "employees",
        "version": 1,
        "filters": {"salary": {"$gte": 50000}}
    })
    assert res["ok"] is False
    assert res["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_query_sort_unauthorized_field_forbidden():
    """Sorting on unauthorized field returns FORBIDDEN."""
    server, db = _make_server()
    query_handler = server["routes"]["POST /datafn/query"]

    res = await query_handler({}, {
        "resource": "employees",
        "version": 1,
        "sort": ["salary:desc"]
    })
    assert res["ok"] is False
    assert res["error"]["code"] == "FORBIDDEN"
