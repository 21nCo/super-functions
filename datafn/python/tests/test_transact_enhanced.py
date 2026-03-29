import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

schema = {
    "resources": [
        {"name": "tasks", "fields": [
            {"name": "title", "type": "string"},
            {"name": "status", "type": "string"},
        ]}
    ],
    "relations": [],
}


async def _setup(records=None):
    db = MockAdapter()
    if records:
        for r in records:
            await db.create("tasks", r)
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/transact"]
    mutation_handler = server["routes"]["POST /datafn/mutation"]
    return handler, mutation_handler, db


# --- TXN-001: Atomic commit ---

class TestAtomicCommit:
    @pytest.mark.asyncio
    async def test_atomic_all_succeed(self):
        handler, _, db = await _setup()
        res = await handler({}, {
            "atomic": True,
            "steps": [
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t1", "record": {"title": "A"}}},
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t2", "record": {"title": "B"}}},
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t3", "record": {"title": "C"}}},
            ],
        })
        assert res["ok"] is True
        assert res["result"]["ok"] is True
        assert len(res["result"]["results"]) == 3
        tasks = await db.find_many("tasks", [])
        assert len(tasks) == 3


# --- TXN-001: Atomic rollback ---

class TestAtomicRollback:
    @pytest.mark.asyncio
    async def test_atomic_rollback_on_error(self):
        handler, _, db = await _setup()
        res = await handler({}, {
            "atomic": True,
            "steps": [
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t1", "record": {"title": "A"}}},
                {"mutation": {"resource": "tasks", "operation": "invalid_op", "record": {}}},
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t3", "record": {"title": "C"}}},
            ],
        })
        assert res["ok"] is True  # Envelope ok
        assert res["result"]["ok"] is False  # Transaction failed
        # All prior data rolled back
        tasks = await db.find_many("tasks", [])
        assert len(tasks) == 0


# --- TXN-002: Rollback annotation ---

class TestRollbackAnnotation:
    @pytest.mark.asyncio
    async def test_prior_mutations_marked_rolled_back(self):
        handler, _, db = await _setup()
        res = await handler({}, {
            "atomic": True,
            "steps": [
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t1", "record": {"title": "A"}}},
                {"mutation": {"resource": "tasks", "operation": "invalid_op", "record": {}}},
            ],
        })
        assert res["ok"] is True
        result = res["result"]
        assert result["ok"] is False
        results = result["results"]
        assert len(results) == 2
        # First mutation result should be marked as rolled back
        assert results[0].get("rolledBack") is True
        # Second result is the error
        assert results[1].get("ok") is False

    @pytest.mark.asyncio
    async def test_query_results_not_marked_rolled_back(self):
        handler, _, db = await _setup([
            {"id": "t0", "title": "Existing"},
        ])
        res = await handler({}, {
            "atomic": True,
            "steps": [
                {"query": {"resource": "tasks", "version": 1}},
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t1", "record": {"title": "A"}}},
                {"mutation": {"resource": "tasks", "operation": "invalid_op", "record": {}}},
            ],
        })
        assert res["ok"] is True
        result = res["result"]
        assert result["ok"] is False
        results = result["results"]
        assert len(results) == 3
        # Query result should NOT have rolledBack
        assert "rolledBack" not in results[0]
        # Mutation result should be rolled back
        assert results[1].get("rolledBack") is True
        # Error result
        assert results[2].get("ok") is False


# --- Non-atomic mode ---

class TestNonAtomic:
    @pytest.mark.asyncio
    async def test_non_atomic_continues_on_error(self):
        handler, _, db = await _setup()
        res = await handler({}, {
            "atomic": False,
            "steps": [
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t1", "record": {"title": "A"}}},
                {"mutation": {"resource": "tasks", "operation": "invalid_op", "record": {}}},
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t3", "record": {"title": "C"}}},
            ],
        })
        assert res["ok"] is True
        result = res["result"]
        assert result["ok"] is False  # At least one error
        # All 3 steps should have results
        assert len(result["results"]) == 3
        # First succeeded
        assert result["results"][0]["ok"] is True
        # Second failed
        assert result["results"][1]["ok"] is False
        # Third succeeded (continued past error)
        assert result["results"][2]["ok"] is True
        # t1 and t3 committed, t2 errored
        tasks = await db.find_many("tasks", [])
        assert len(tasks) == 2

    @pytest.mark.asyncio
    async def test_non_atomic_no_rollback_annotations(self):
        handler, _, db = await _setup()
        res = await handler({}, {
            "atomic": False,
            "steps": [
                {"mutation": {"resource": "tasks", "operation": "insert", "id": "t1", "record": {"title": "A"}}},
                {"mutation": {"resource": "tasks", "operation": "invalid_op", "record": {}}},
            ],
        })
        result = res["result"]
        # First result should NOT have rolledBack
        assert "rolledBack" not in result["results"][0]


# --- MUT-007: Guard with transaction ---

class TestGuardTransaction:
    @pytest.mark.asyncio
    async def test_guard_fails_mutation_not_executed(self):
        _, mutation_handler, db = await _setup([
            {"id": "task_1", "title": "Task", "status": "closed"},
        ])
        res = await mutation_handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "task_1",
            "if": {"status": {"$eq": "active"}},
            "record": {"title": "Updated"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "CONFLICT"
        # Record unchanged
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "task_1"}])
        assert task["title"] == "Task"

    @pytest.mark.asyncio
    async def test_guard_passes_mutation_executed(self):
        _, mutation_handler, db = await _setup([
            {"id": "task_1", "title": "Task", "status": "active"},
        ])
        res = await mutation_handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "task_1",
            "if": {"status": {"$eq": "active"}},
            "record": {"title": "Updated"},
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "task_1"}])
        assert task["title"] == "Updated"

    @pytest.mark.asyncio
    async def test_guard_on_nonexistent_record_fails(self):
        _, mutation_handler, db = await _setup()
        res = await mutation_handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "nonexistent",
            "if": {"status": {"$eq": "active"}},
            "record": {"title": "Updated"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "CONFLICT"
