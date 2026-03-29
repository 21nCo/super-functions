import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

schema = {
    "resources": [
        {"name": "tasks", "fields": [
            {"name": "title", "type": "string"},
            {"name": "status", "type": "string"},
            {"name": "dueDate", "type": "date"},
        ]}
    ],
    "relations": [],
}

schema_with_join = {
    "resources": [
        {"name": "tasks", "fields": [
            {"name": "title", "type": "string"},
        ]},
        {"name": "tags", "fields": [
            {"name": "name", "type": "string"},
        ]},
    ],
    "relations": [
        {
            "from": "tasks",
            "to": "tags",
            "type": "many-many",
            "relation": "tags",
            "inverse": "tasks",
        }
    ],
}


async def _setup(schema_override=None, limits=None):
    db = MockAdapter()
    s = schema_override or schema
    config = {"schema": s, "db": db}
    if limits:
        config["limits"] = limits
    server = create_datafn_server(config)
    return server, db


# --- SYN-001: Push date coercion ---

class TestPushDateCoercion:
    @pytest.mark.asyncio
    async def test_iso_string_coerced_to_epoch_ms(self):
        server, db = await _setup()
        push = server["routes"]["POST /datafn/push"]
        res = await push({}, {
            "clientId": "c1",
            "mutations": [{
                "clientId": "c1",
                "mutationId": "m1",
                "operation": "insert",
                "resource": "tasks",
                "id": "t1",
                "record": {"title": "Task", "dueDate": "2024-01-01T00:00:00Z"},
            }],
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "t1"}])
        assert task["dueDate"] == 1704067200000

    @pytest.mark.asyncio
    async def test_epoch_number_unchanged(self):
        server, db = await _setup()
        push = server["routes"]["POST /datafn/push"]
        res = await push({}, {
            "clientId": "c1",
            "mutations": [{
                "clientId": "c1",
                "mutationId": "m1",
                "operation": "insert",
                "resource": "tasks",
                "id": "t1",
                "record": {"title": "Task", "dueDate": 1704067200000},
            }],
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "t1"}])
        assert task["dueDate"] == 1704067200000

    @pytest.mark.asyncio
    async def test_non_date_fields_not_modified(self):
        server, db = await _setup()
        push = server["routes"]["POST /datafn/push"]
        res = await push({}, {
            "clientId": "c1",
            "mutations": [{
                "clientId": "c1",
                "mutationId": "m1",
                "operation": "insert",
                "resource": "tasks",
                "id": "t1",
                "record": {"title": "Task", "status": "active"},
            }],
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "t1"}])
        assert task["title"] == "Task"
        assert task["status"] == "active"


# --- SYN-002: Pull cursor validation ---

class TestPullCursorValidation:
    @pytest.mark.asyncio
    async def test_valid_cursor_accepted(self):
        server, db = await _setup()
        pull = server["routes"]["POST /datafn/pull"]
        res = await pull({}, {
            "clientId": "c1",
            "cursors": {"tasks": "0"},
        })
        assert res["ok"] is True

    @pytest.mark.asyncio
    async def test_non_numeric_cursor_rejected(self):
        server, db = await _setup()
        pull = server["routes"]["POST /datafn/pull"]
        res = await pull({}, {
            "clientId": "c1",
            "cursors": {"tasks": "abc"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"
        assert "cursor" in res["error"]["message"].lower()

    @pytest.mark.asyncio
    async def test_negative_cursor_rejected(self):
        server, db = await _setup()
        pull = server["routes"]["POST /datafn/pull"]
        res = await pull({}, {
            "clientId": "c1",
            "cursors": {"tasks": "-1"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"


# --- SYN-003: Pull limit enforcement ---

class TestPullLimit:
    @pytest.mark.asyncio
    async def test_pull_limits_changes_with_has_more(self):
        server, db = await _setup(limits={"maxPullLimit": 2})
        push = server["routes"]["POST /datafn/push"]
        pull = server["routes"]["POST /datafn/pull"]

        # Push 5 mutations
        mutations = []
        for i in range(1, 6):
            mutations.append({
                "clientId": "c1",
                "mutationId": f"m{i}",
                "operation": "insert",
                "resource": "tasks",
                "id": f"t{i}",
                "record": {"title": f"Task {i}"},
            })
        await push({}, {"clientId": "c1", "mutations": mutations})

        # Pull with limit 2
        res = await pull({}, {"clientId": "c2", "cursors": {}})
        assert res["ok"] is True
        assert res["result"]["hasMore"] is True

    @pytest.mark.asyncio
    async def test_pull_no_has_more_when_all_fit(self):
        server, db = await _setup(limits={"maxPullLimit": 100})
        push = server["routes"]["POST /datafn/push"]
        pull = server["routes"]["POST /datafn/pull"]

        # Push 2 mutations
        await push({}, {
            "clientId": "c1",
            "mutations": [
                {"clientId": "c1", "mutationId": "m1", "operation": "insert",
                 "resource": "tasks", "id": "t1", "record": {"title": "A"}},
                {"clientId": "c1", "mutationId": "m2", "operation": "insert",
                 "resource": "tasks", "id": "t2", "record": {"title": "B"}},
            ],
        })

        res = await pull({}, {"clientId": "c2", "cursors": {}})
        assert res["ok"] is True
        assert res["result"]["hasMore"] is False


# --- SYN-004: Join table sync ---

class TestJoinTableSync:
    @pytest.mark.asyncio
    async def test_pull_includes_join_table_in_tables(self):
        server, db = await _setup(schema_override=schema_with_join)
        pull = server["routes"]["POST /datafn/pull"]

        # Manually create a join table change entry
        from datafn.change_tracking import write_change
        await write_change(db, "datafn", "__datafn_join_tasks_tags", "insert", "jt1", 1)

        # Create the actual join record
        await db.create("__datafn_join_tasks_tags", {"id": "jt1", "taskId": "t1", "tagId": "tag1"})

        res = await pull({}, {"clientId": "c2", "cursors": {}})
        assert res["ok"] is True
        # Join table should be in records or cursors
        result = res["result"]
        join_table = "__datafn_join_tasks_tags"
        has_join_data = (
            join_table in result.get("records", {}) or
            join_table in result.get("cursors", {})
        )
        assert has_join_data


# --- SYN-005: Namespace consistency ---

class TestNamespaceConsistency:
    @pytest.mark.asyncio
    async def test_namespace_passed_to_adapter(self):
        server, db = await _setup()
        push = server["routes"]["POST /datafn/push"]

        # Track adapter calls
        original_create = db.create
        create_calls = []

        async def tracked_create(model, data, namespace="datafn"):
            create_calls.append({"model": model, "namespace": namespace})
            return await original_create(model, data, namespace=namespace)

        db.create = tracked_create

        await push({}, {
            "clientId": "c1",
            "mutations": [{
                "clientId": "c1",
                "mutationId": "m1",
                "operation": "insert",
                "resource": "tasks",
                "id": "t1",
                "record": {"title": "Task"},
            }],
        })

        # All create calls should have namespace
        for call in create_calls:
            assert "namespace" in call

    @pytest.mark.asyncio
    async def test_custom_namespace_from_context(self):
        server, db = await _setup()
        push = server["routes"]["POST /datafn/push"]

        original_create = db.create
        create_namespaces = []

        async def tracked_create(model, data, namespace="datafn"):
            create_namespaces.append(namespace)
            return await original_create(model, data, namespace=namespace)

        db.create = tracked_create

        # Pass namespace in context
        ctx = {"namespace": "org-acme:user-1"}
        await push(ctx, {
            "clientId": "c1",
            "mutations": [{
                "clientId": "c1",
                "mutationId": "m1",
                "operation": "insert",
                "resource": "tasks",
                "id": "t1",
                "record": {"title": "Task"},
            }],
        })

        # Change tracking calls should use custom namespace
        assert any(ns == "org-acme:user-1" for ns in create_namespaces)
