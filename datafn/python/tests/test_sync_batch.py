"""
Phase 09: Batch record fetching tests (PY-001)
Test vector: TV-PY-BATCH-001
"""

import pytest
from unittest.mock import AsyncMock, patch
from datafn.server import create_datafn_server
from .mock_db import MockAdapter


schema = {
    "resources": [
        {"name": "task", "fields": [{"name": "title"}, {"name": "status"}]},
    ],
    "relations": [],
}


@pytest.mark.asyncio
async def test_pull_uses_batch_fetch():
    """
    TV-PY-BATCH-001: handle_pull fetches records with a single batch find_many
    using IN filter instead of N individual find_one calls.
    """
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    push_handler = server["routes"]["POST /datafn/push"]
    pull_handler = server["routes"]["POST /datafn/pull"]

    # Push 5 mutations to create records and change log entries
    mutations = []
    for i in range(1, 6):
        mutations.append({
            "clientId": "c1",
            "mutationId": f"m{i}",
            "operation": "insert",
            "resource": "task",
            "id": f"task-{i}",
            "record": {"title": f"Task {i}", "status": "active"},
        })

    push_res = await push_handler({}, {
        "clientId": "c1",
        "mutations": mutations,
    })
    assert push_res["ok"] is True

    # Wrap find_many to track calls
    original_find_many = db.find_many
    find_many_calls = []

    async def tracked_find_many(model, where, **kwargs):
        find_many_calls.append({"model": model, "where": where, "kwargs": kwargs})
        return await original_find_many(model, where, **kwargs)

    db.find_many = tracked_find_many

    # Now pull
    pull_res = await pull_handler({}, {
        "clientId": "c2",
        "cursors": {},
    })

    assert pull_res["ok"] is True
    result = pull_res["result"]
    records = result.get("records", {})

    # Should have task records
    assert "task" in records
    assert len(records["task"]) == 5

    # Verify batch fetch: there should be a find_many call to "task" with an IN filter
    task_find_many_calls = [
        c for c in find_many_calls
        if c["model"] == "task"
    ]
    assert len(task_find_many_calls) == 1, (
        f"Expected exactly 1 find_many call to 'task', got {len(task_find_many_calls)}. "
        f"N+1 pattern not eliminated."
    )

    # Verify the call used IN operator
    where_clauses = task_find_many_calls[0]["where"]
    assert any(
        w.get("operator") == "in" and w.get("field") == "id"
        for w in where_clauses
    ), "Expected find_many to use 'in' operator on 'id' field"


@pytest.mark.asyncio
async def test_pull_batch_fetch_returns_correct_records():
    """Batch fetch returns the same records as N+1 would."""
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    push_handler = server["routes"]["POST /datafn/push"]
    pull_handler = server["routes"]["POST /datafn/pull"]

    # Push 3 records
    await push_handler({}, {
        "clientId": "c1",
        "mutations": [
            {"clientId": "c1", "mutationId": "m1", "operation": "insert",
             "resource": "task", "id": "t1", "record": {"title": "A", "status": "active"}},
            {"clientId": "c1", "mutationId": "m2", "operation": "insert",
             "resource": "task", "id": "t2", "record": {"title": "B", "status": "done"}},
            {"clientId": "c1", "mutationId": "m3", "operation": "insert",
             "resource": "task", "id": "t3", "record": {"title": "C", "status": "active"}},
        ],
    })

    pull_res = await pull_handler({}, {
        "clientId": "c2",
        "cursors": {},
    })

    assert pull_res["ok"] is True
    records = pull_res["result"]["records"]["task"]
    ids = {r["id"] for r in records}
    assert ids == {"t1", "t2", "t3"}


@pytest.mark.asyncio
async def test_pull_handles_deletes_correctly():
    """Deleted records appear in deleted, not records."""
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    push_handler = server["routes"]["POST /datafn/push"]
    pull_handler = server["routes"]["POST /datafn/pull"]

    # Insert then delete
    await push_handler({}, {
        "clientId": "c1",
        "mutations": [
            {"clientId": "c1", "mutationId": "m1", "operation": "insert",
             "resource": "task", "id": "t1", "record": {"title": "A", "status": "active"}},
            {"clientId": "c1", "mutationId": "m2", "operation": "delete",
             "resource": "task", "id": "t1", "record": {}},
        ],
    })

    pull_res = await pull_handler({}, {
        "clientId": "c2",
        "cursors": {},
    })

    assert pull_res["ok"] is True
    result = pull_res["result"]
    deleted = result.get("deleted", {})
    # t1 was deleted, so it should appear in deleted
    assert "task" in deleted
    assert "t1" in deleted["task"]
