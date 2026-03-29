import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

schema = {
    "resources": [
        {"name": "tasks", "fields": [
            {"name": "title", "type": "string", "required": True},
            {"name": "status", "type": "string", "default": "pending"},
            {"name": "priority", "type": "number"},
            {"name": "description", "type": "string"},
            {"name": "details", "type": "object"},
        ]}
    ],
    "relations": [],
}


async def _setup(records=None, limits=None):
    db = MockAdapter()
    if records:
        for r in records:
            await db.create("tasks", r)
    config = {"schema": schema, "db": db, "limits": limits}
    server = create_datafn_server(config)
    handler = server["routes"]["POST /datafn/mutation"]
    return handler, db


# --- Merge Decision (MUT-001 / TV-MUT-001) ---

class TestMergeDecision:
    @pytest.mark.asyncio
    async def test_merge_creates_when_not_exists(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "new_task",
            "record": {"title": "New Task"},
        })
        assert res["ok"] is True
        assert "new_task" in res["result"]["affectedIds"]
        # Verify record was created
        tasks = await db.find_many("tasks", [{"field": "id", "operator": "eq", "value": "new_task"}])
        assert len(tasks) == 1
        assert tasks[0]["title"] == "New Task"

    @pytest.mark.asyncio
    async def test_merge_updates_when_exists(self):
        handler, db = await _setup([
            {"id": "task_1", "title": "Old Title", "status": "active"},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "task_1",
            "record": {"title": "Updated Title"},
        })
        assert res["ok"] is True
        assert "task_1" in res["result"]["affectedIds"]
        # Verify only title was updated
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "task_1"}])
        assert task["title"] == "Updated Title"
        assert task["status"] == "active"  # unchanged


# --- Replace (MUT-002 / TV-MUT-002) ---

class TestReplace:
    @pytest.mark.asyncio
    async def test_replace_preserves_system_fields(self):
        handler, db = await _setup([
            {"id": "task_1", "title": "Old", "status": "active", "createdAt": 12345},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "replace", "id": "task_1",
            "record": {"title": "New Title", "createdAt": 9999},
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "task_1"}])
        assert task["title"] == "New Title"
        assert task.get("createdAt") == 12345  # NOT overwritten

    @pytest.mark.asyncio
    async def test_replace_nulls_missing_fields(self):
        handler, db = await _setup([
            {"id": "task_1", "title": "Old", "status": "active", "priority": 5},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "replace", "id": "task_1",
            "record": {"title": "New"},
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "task_1"}])
        assert task["title"] == "New"
        # status has a default, so gets the default value
        assert task.get("status") == "pending"
        # priority has no default, so null
        assert task.get("priority") is None


# --- Batch Insert (MUT-003 / TV-MUT-003) ---

class TestBatchInsert:
    @pytest.mark.asyncio
    async def test_batch_insert_multiple_records(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "records": [
                {"id": "t1", "title": "A"},
                {"id": "t2", "title": "B"},
            ],
        })
        assert res["ok"] is True
        assert res["result"]["affectedIds"] == ["t1", "t2"]
        tasks = await db.find_many("tasks", [])
        assert len(tasks) == 2

    @pytest.mark.asyncio
    async def test_batch_insert_respects_batch_size_limit(self):
        handler, _db = await _setup(limits={"maxBatchSize": 1})
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "records": [
                {"id": "t1", "title": "A"},
                {"id": "t2", "title": "B"},
            ],
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "LIMIT_EXCEEDED"


# --- Error Classification (MUT-004 / TV-MUT-004) ---

class TestErrorClassification:
    @pytest.mark.asyncio
    async def test_duplicate_key_conflict(self):
        handler, db = await _setup([
            {"id": "task_1", "title": "Existing"},
        ])

        # Override create to simulate duplicate key error
        original_create = db.create

        async def failing_create(model, data, namespace="datafn"):
            raise Exception("unique constraint violation")

        db.create = failing_create

        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_dup",
            "record": {"title": "Dup"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "CONFLICT"


# --- Field Type Validation (VAL-004 / TV-VAL-005) ---

class TestFieldTypeValidation:
    @pytest.mark.asyncio
    async def test_string_field_rejects_number(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_bad",
            "record": {"title": 123},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"
        assert "title" in res["error"]["message"]
        assert "string" in res["error"]["message"]


# --- Required Field Validation (VAL-005 / TV-VAL-006) ---

class TestRequiredFieldValidation:
    @pytest.mark.asyncio
    async def test_insert_without_required_field_fails(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_no_title",
            "record": {"priority": 5},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"
        assert "title" in res["error"]["message"]
        assert "missing" in res["error"]["message"].lower()

    @pytest.mark.asyncio
    async def test_merge_update_skips_required_check(self):
        handler, db = await _setup([
            {"id": "task_1", "title": "Existing", "status": "active"},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "task_1",
            "record": {"priority": 10},
        })
        # Should succeed — merge on existing skips required field check
        assert res["ok"] is True


# --- Default Value Application (VAL-006 / TV-VAL-007) ---

class TestDefaultValues:
    @pytest.mark.asyncio
    async def test_missing_field_gets_default_on_insert(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_default",
            "record": {"title": "Task 1"},
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "task_default"}])
        assert task["status"] == "pending"  # default value applied

    @pytest.mark.asyncio
    async def test_defaults_applied_on_merge_create(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "new_merge",
            "record": {"title": "Merged"},
        })
        assert res["ok"] is True
        task = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "new_merge"}])
        assert task["status"] == "pending"


# --- Prototype Pollution (VAL-007 / TV-VAL-008) ---

class TestPrototypePollution:
    @pytest.mark.asyncio
    async def test_proto_key_rejected(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_hack",
            "record": {"__proto__": {"isAdmin": True}, "title": "hack"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"
        assert "Prototype pollution" in res["error"]["message"]
        assert "__proto__" in res["error"]["message"]

    @pytest.mark.asyncio
    async def test_nested_proto_key_rejected(self):
        handler, _db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_hack2",
            "record": {
                "title": "ok",
                "details": {"nested": {"__proto__": {"polluted": True}}},
            },
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"
        assert "Prototype pollution" in res["error"]["message"]
        assert "__proto__" in res["error"]["message"]

    @pytest.mark.asyncio
    async def test_constructor_key_rejected(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_con",
            "record": {"constructor": {"x": 1}, "title": "hack"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"
        assert "Prototype pollution" in res["error"]["message"]

    @pytest.mark.asyncio
    async def test_batch_proto_pollution_rejected(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "records": [
                {"id": "t1", "title": "ok"},
                {"id": "t2", "__proto__": {}, "title": "bad"},
            ],
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"


# --- ID Length Validation (VAL-009 / TV-VAL-010) ---

class TestIdLength:
    @pytest.mark.asyncio
    async def test_oversized_id_rejected(self):
        handler, db = await _setup(limits={"maxIdLength": 10})
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "a" * 20,
            "record": {"title": "Task"},
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"
        assert "ID exceeds" in res["error"]["message"]


# --- Change Tracking (MUT-005 / TV-MUT-005) ---

class TestChangeTracking:
    @pytest.mark.asyncio
    async def test_insert_writes_change_record(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "id": "task_ct",
            "record": {"title": "Tracked"},
        })
        assert res["ok"] is True
        changes = await db.find_many("__datafn_changes", [])
        assert len(changes) == 1
        assert changes[0]["table"] == "tasks"
        assert changes[0]["operation"] == "insert"
        assert changes[0]["recordId"] == "task_ct"

    @pytest.mark.asyncio
    async def test_merge_update_writes_change(self):
        handler, db = await _setup([
            {"id": "task_1", "title": "Old"},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "merge", "id": "task_1",
            "record": {"title": "New"},
        })
        assert res["ok"] is True
        changes = await db.find_many("__datafn_changes", [])
        assert len(changes) == 1
        assert changes[0]["operation"] == "update"

    @pytest.mark.asyncio
    async def test_delete_writes_change(self):
        handler, db = await _setup([
            {"id": "task_1", "title": "To Delete"},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "delete", "id": "task_1",
        })
        assert res["ok"] is True
        changes = await db.find_many("__datafn_changes", [])
        assert len(changes) == 1
        assert changes[0]["operation"] == "delete"

    @pytest.mark.asyncio
    async def test_batch_insert_writes_changes(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "records": [
                {"id": "t1", "title": "A"},
                {"id": "t2", "title": "B"},
            ],
        })
        assert res["ok"] is True
        changes = await db.find_many("__datafn_changes", [])
        assert len(changes) == 2


# --- Idempotent Delete (MUT-006 / TV-MUT-006) ---

class TestIdempotentDelete:
    @pytest.mark.asyncio
    async def test_delete_nonexistent_succeeds(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "delete", "id": "nonexistent_id",
        })
        assert res["ok"] is True
        assert res["result"]["affectedIds"] == []

    @pytest.mark.asyncio
    async def test_delete_nonexistent_no_change_tracking(self):
        handler, db = await _setup()
        await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "delete", "id": "nonexistent_id",
        })
        changes = await db.find_many("__datafn_changes", [])
        assert len(changes) == 0


# --- Result Structure (MUT-008 / TV-MUT-008) ---

class TestResultStructure:
    @pytest.mark.asyncio
    async def test_result_has_all_fields(self):
        handler, db = await _setup()
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "clientId": "c1",
            "mutationId": "mut_xyz",
            "id": "task_1",
            "record": {"title": "Task 1"},
        })
        assert res["ok"] is True
        result = res["result"]
        assert result["ok"] is True
        assert result["mutationId"] == "mut_xyz"
        assert result["affectedIds"] == ["task_1"]
        assert result["deduped"] is False
        assert result["errors"] == []

    @pytest.mark.asyncio
    async def test_deduped_true_on_cache_hit(self):
        handler, db = await _setup()
        payload = {
            "resource": "tasks", "version": 1,
            "operation": "insert",
            "clientId": "c1",
            "mutationId": "m1",
            "id": "task_1",
            "record": {"title": "Task 1"},
        }
        # First call
        await handler({}, payload)
        # Second call (cache hit)
        res2 = await handler({}, payload)
        assert res2["ok"] is True
        assert res2["result"]["deduped"] is True
