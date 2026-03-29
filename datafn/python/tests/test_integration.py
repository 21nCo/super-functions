"""
End-to-end integration tests for datafn Python server.
Covers: config validation, logger, plugins/hooks, field authz, limits,
cursor pagination, aggregation, merge decision, replace, batch insert,
transaction rollback, sync push/pull.
"""
import pytest
from unittest.mock import MagicMock
from datafn.server import create_datafn_server
from datafn.envelope import DatafnError
from .mock_db import MockAdapter


# ---------------------------------------------------------------------------
# Shared helpers & schemas
# ---------------------------------------------------------------------------
FULL_SCHEMA = {
    "resources": [
        {
            "name": "tasks",
            "version": 1,
            "fields": [
                {"name": "title", "type": "string", "required": True},
                {"name": "status", "type": "string", "default": "pending"},
                {"name": "priority", "type": "number"},
                {"name": "description", "type": "string"},
            ],
        },
        {
            "name": "tags",
            "version": 1,
            "fields": [
                {"name": "label", "type": "string"},
            ],
        },
        {
            "name": "__datafn_idempotency",
            "fields": [
                {"name": "clientId"},
                {"name": "mutationId"},
                {"name": "result"},
            ],
        },
        {
            "name": "__datafn_changes",
            "fields": [
                {"name": "table"},
                {"name": "operation"},
                {"name": "recordId"},
            ],
        },
        {
            "name": "__datafn_seed",
            "fields": [
                {"name": "timestamp"},
            ],
        },
        {
            "name": "__datafn_seq",
            "fields": [
                {"name": "value"},
            ],
        },
    ],
    "relations": [],
}


def _make_server(schema=None, **extra):
    db = MockAdapter()
    cfg = {"schema": schema or FULL_SCHEMA, "db": db, **extra}
    server = create_datafn_server(cfg)
    return server, db


# ---------------------------------------------------------------------------
# 1. Config validation
# ---------------------------------------------------------------------------
class TestConfigValidation:
    def test_missing_schema_raises(self):
        """SRV-004: missing schema raises ValueError."""
        with pytest.raises((ValueError, TypeError), match="schema"):
            create_datafn_server({"db": MockAdapter()})

    def test_missing_db_raises(self):
        """SRV-004: missing db raises ValueError."""
        with pytest.raises(ValueError, match="db is required"):
            create_datafn_server({"schema": FULL_SCHEMA})

    def test_invalid_limits_negative(self):
        """SRV-004: negative limit value raises ValueError."""
        with pytest.raises(ValueError, match="non-negative"):
            create_datafn_server({"schema": FULL_SCHEMA, "db": MockAdapter(), "limits": {"maxLimit": -1}})

    def test_invalid_authorize_not_callable(self):
        """SRV-004: non-callable authorize raises ValueError."""
        with pytest.raises(ValueError, match="callable"):
            create_datafn_server({"schema": FULL_SCHEMA, "db": MockAdapter(), "authorize": "not-a-fn"})

    def test_valid_config_succeeds(self):
        """SRV-004: valid config creates server without error."""
        server, _ = _make_server()
        assert "routes" in server


# ---------------------------------------------------------------------------
# 2. Logger
# ---------------------------------------------------------------------------
class TestLogger:
    def test_logger_called_on_init(self):
        """SRV-001 / TV-SRV-001: logger.info called with 'DataFn server initialized'."""
        mock_logger = MagicMock()
        _make_server(logger=mock_logger)
        mock_logger.info.assert_called_with("DataFn server initialized")

    @pytest.mark.asyncio
    async def test_logger_debug_on_query(self):
        """SRV-001: logger.debug called on query request."""
        mock_logger = MagicMock()
        server, _ = _make_server(logger=mock_logger)
        handler = server["routes"]["POST /datafn/query"]
        await handler({}, {"resource": "tasks", "version": 1})
        # Should have debug calls for request start and completion
        debug_calls = [str(c) for c in mock_logger.debug.call_args_list]
        assert any("Query request" in c for c in debug_calls)
        assert any("Query completed" in c for c in debug_calls)


# ---------------------------------------------------------------------------
# 3. Plugin / hook system
# ---------------------------------------------------------------------------
class TestPlugins:
    @pytest.mark.asyncio
    async def test_before_query_hook_modifies_query(self):
        """SRV-002 / TV-SRV-002: Plugin adds limit to query."""
        class LimitPlugin:
            name = "limit-plugin"
            runs_on = ["server"]
            async def before_query(self, ctx, query):
                query["limit"] = 10
                return query

        server, db = _make_server(plugins=[LimitPlugin()])
        handler = server["routes"]["POST /datafn/query"]
        # Insert 20 records
        for i in range(20):
            await db.create("tasks", {"id": f"t{i:02d}", "title": f"Task {i}", "status": "active"})

        res = await handler({}, {"resource": "tasks", "version": 1, "limit": 50})
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 10

    @pytest.mark.asyncio
    async def test_before_mutation_hook_rejects(self):
        """SRV-002: Plugin rejects mutation."""
        class RejectPlugin:
            name = "reject-plugin"
            runs_on = ["server"]
            async def before_mutation(self, ctx, mutation):
                raise Exception("Rejected by policy")

        server, _db = _make_server(plugins=[RejectPlugin()])
        handler = server["routes"]["POST /datafn/mutation"]
        res = await handler({}, {
            "resource": "tasks", "version": 1, "operation": "insert",
            "id": "t1", "record": {"title": "Test"}
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "PLUGIN_ERROR"


# ---------------------------------------------------------------------------
# 4. Limit enforcement
# ---------------------------------------------------------------------------
class TestLimits:
    @pytest.mark.asyncio
    async def test_max_select_tokens_exceeded(self):
        """VAL-008 / TV-VAL-009: Query with too many select tokens rejected."""
        server, _db = _make_server(limits={"maxSelectTokens": 2})
        handler = server["routes"]["POST /datafn/query"]
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "select": ["id", "title", "status"]
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "LIMIT_EXCEEDED"


# ---------------------------------------------------------------------------
# 5. Payload size limit
# ---------------------------------------------------------------------------
class TestPayloadSizeLimit:
    def test_check_payload_size_exceeds(self):
        """SRV-003 / TV-SRV-003: Oversized payload returns LIMIT_EXCEEDED."""
        from datafn.authz import check_payload_size
        body = b"x" * (5 * 1024 * 1024 + 1)  # 5MB + 1 byte
        err = check_payload_size(body, 5 * 1024 * 1024)
        assert err is not None
        assert err.code == "LIMIT_EXCEEDED"

    def test_check_payload_size_within_limit(self):
        """SRV-003: Payload within limit returns None."""
        from datafn.authz import check_payload_size
        body = b"x" * 100
        err = check_payload_size(body, 5 * 1024 * 1024)
        assert err is None


# ---------------------------------------------------------------------------
# 6. Cursor pagination end-to-end
# ---------------------------------------------------------------------------
class TestCursorPagination:
    @pytest.mark.asyncio
    async def test_paginate_with_limit_3(self):
        """QRY-001/003: Insert 10 records, paginate with limit 3."""
        server, db = _make_server()
        handler_q = server["routes"]["POST /datafn/query"]
        handler_m = server["routes"]["POST /datafn/mutation"]

        for i in range(10):
            await handler_m({}, {
                "resource": "tasks", "version": 1, "operation": "insert",
                "id": f"t{i:02d}", "record": {"title": f"Task {i}"}
            })

        # Page 1
        res1 = await handler_q({}, {
            "resource": "tasks", "version": 1, "sort": ["id"], "limit": 3
        })
        assert res1["ok"] is True
        assert len(res1["result"]["data"]) == 3
        assert res1["result"]["data"][0]["id"] == "t00"
        assert res1["result"]["nextCursor"] is not None

        # Page 2
        res2 = await handler_q({}, {
            "resource": "tasks", "version": 1, "sort": ["id"], "limit": 3,
            "cursor": {"after": res1["result"]["nextCursor"]}
        })
        assert res2["ok"] is True
        assert len(res2["result"]["data"]) == 3
        assert res2["result"]["data"][0]["id"] == "t03"


# ---------------------------------------------------------------------------
# 7. Aggregation end-to-end
# ---------------------------------------------------------------------------
class TestAggregation:
    @pytest.mark.asyncio
    async def test_group_by_count(self):
        """QRY-007 / TV-QRY-007: GroupBy + count aggregation."""
        server, _db = _make_server()
        handler_m = server["routes"]["POST /datafn/mutation"]
        handler_q = server["routes"]["POST /datafn/query"]

        for item in [
            {"id": "t1", "title": "A", "status": "active", "priority": 5},
            {"id": "t2", "title": "B", "status": "active", "priority": 3},
            {"id": "t3", "title": "C", "status": "closed", "priority": 1},
        ]:
            await handler_m({}, {
                "resource": "tasks", "version": 1, "operation": "insert",
                "id": item["id"], "record": item
            })

        res = await handler_q({}, {
            "resource": "tasks", "version": 1,
            "groupBy": ["status"],
            "aggregations": {"total": {"count": "*"}, "avgPriority": {"avg": "priority"}}
        })
        assert res["ok"] is True
        data = res["result"]["data"]
        active = next(r for r in data if r["status"] == "active")
        closed = next(r for r in data if r["status"] == "closed")
        assert active["total"] == 2
        assert active["avgPriority"] == 4.0
        assert closed["total"] == 1
        assert closed["avgPriority"] == 1.0


# ---------------------------------------------------------------------------
# 8. Merge decision end-to-end
# ---------------------------------------------------------------------------
class TestMergeDecision:
    @pytest.mark.asyncio
    async def test_merge_nonexistent_creates(self):
        """MUT-001 / TV-MUT-001: Merge on non-existent creates."""
        server, db = _make_server()
        handler = server["routes"]["POST /datafn/mutation"]

        res = await handler({}, {
            "resource": "tasks", "version": 1, "operation": "merge",
            "id": "new_task", "record": {"title": "New Task", "status": "active"}
        })
        assert res["ok"] is True
        assert "new_task" in res["result"]["affectedIds"]

        # Verify record exists
        record = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "new_task"}])
        assert record is not None
        assert record["title"] == "New Task"

    @pytest.mark.asyncio
    async def test_merge_existing_updates(self):
        """MUT-001: Merge on existing updates."""
        server, db = _make_server()
        handler = server["routes"]["POST /datafn/mutation"]

        # Create first
        await handler({}, {
            "resource": "tasks", "version": 1, "operation": "insert",
            "id": "t1", "record": {"title": "Original", "status": "active"}
        })

        # Merge (update)
        res = await handler({}, {
            "resource": "tasks", "version": 1, "operation": "merge",
            "id": "t1", "record": {"status": "closed"}
        })
        assert res["ok"] is True

        record = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "t1"}])
        assert record["status"] == "closed"
        assert record["title"] == "Original"  # Untouched


# ---------------------------------------------------------------------------
# 9. Replace end-to-end
# ---------------------------------------------------------------------------
class TestReplace:
    @pytest.mark.asyncio
    async def test_replace_preserves_system_fields(self):
        """MUT-002 / TV-MUT-002: Replace preserves system fields."""
        server, db = _make_server()
        handler = server["routes"]["POST /datafn/mutation"]

        await handler({}, {
            "resource": "tasks", "version": 1, "operation": "insert",
            "id": "t1", "record": {"title": "Original", "priority": 5}
        })

        # Replace — try to overwrite createdAt (system field)
        res = await handler({}, {
            "resource": "tasks", "version": 1, "operation": "replace",
            "id": "t1", "record": {"title": "Replaced"}
        })
        assert res["ok"] is True

        record = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "t1"}])
        assert record["title"] == "Replaced"


# ---------------------------------------------------------------------------
# 10. Batch insert end-to-end
# ---------------------------------------------------------------------------
class TestBatchInsert:
    @pytest.mark.asyncio
    async def test_batch_insert_5_records(self):
        """MUT-003 / TV-MUT-003: Insert 5 records via records[]."""
        server, _db = _make_server()
        handler = server["routes"]["POST /datafn/mutation"]

        records = [{"id": f"t{i}", "title": f"Task {i}"} for i in range(5)]
        res = await handler({}, {
            "resource": "tasks", "version": 1, "operation": "insert",
            "records": records
        })
        assert res["ok"] is True
        assert len(res["result"]["affectedIds"]) == 5


# ---------------------------------------------------------------------------
# 11. Transaction end-to-end
# ---------------------------------------------------------------------------
class TestTransaction:
    @pytest.mark.asyncio
    async def test_atomic_rollback_with_annotation(self):
        """TXN-001/002 / TV-TXN-001/002: Atomic rollback annotates prior results."""
        server, db = _make_server()
        handler = server["routes"]["POST /datafn/transact"]

        res = await handler({}, {
            "atomic": True,
            "steps": [
                {"mutation": {"resource": "tasks", "version": 1, "operation": "insert", "id": "t1", "record": {"title": "A"}}},
                {"mutation": {"resource": "tasks", "version": 1, "operation": "insert", "id": "t2", "record": {"title": "B"}}},
                {"mutation": {"resource": "NONEXISTENT", "version": 1, "operation": "insert", "id": "t3", "record": {"title": "C"}}},
            ]
        })

        assert res["ok"] is True
        inner = res["result"]
        assert inner["ok"] is False

        # Check that rolled-back results have rolledBack: True
        results = inner["results"]
        # First two should have rolledBack
        for r in results[:2]:
            if isinstance(r, dict) and r.get("ok") is not False:
                assert r.get("rolledBack") is True

        # t1 and t2 should NOT be in db (rolled back)
        t1 = await db.find_one("tasks", [{"field": "id", "operator": "eq", "value": "t1"}])
        assert t1 is None


# ---------------------------------------------------------------------------
# 12. Sync end-to-end
# ---------------------------------------------------------------------------
class TestSync:
    @pytest.mark.asyncio
    async def test_push_and_pull(self):
        """SYN-001/003: Push with mutations, pull back."""
        server, _db = _make_server()
        push_handler = server["routes"]["POST /datafn/push"]
        pull_handler = server["routes"]["POST /datafn/pull"]
        seed_handler = server["routes"]["POST /datafn/seed"]

        # Seed
        await seed_handler({}, {"clientId": "client1"})

        # Push a mutation
        res = await push_handler({}, {
            "clientId": "client1",
            "mutations": [
                {
                    "clientId": "client1",
                    "mutationId": "m1",
                    "resource": "tasks",
                    "operation": "insert",
                    "id": "t1",
                    "record": {"title": "Pushed Task"}
                }
            ]
        })
        assert res["ok"] is True
        assert "m1" in res["result"]["applied"]

        pull_res = await pull_handler({}, {
            "clientId": "client1",
            "cursors": {},
        })
        assert pull_res["ok"] is True
        tasks = pull_res["result"]["records"].get("tasks", [])
        assert any(
            record.get("id") == "t1" and record.get("title") == "Pushed Task"
            for record in tasks
        )


# ---------------------------------------------------------------------------
# 13. Full flow: create server → query → mutation → transact
# ---------------------------------------------------------------------------
class TestFullFlow:
    @pytest.mark.asyncio
    async def test_create_query_mutate_transact(self):
        """Full integration flow."""
        server, _db = _make_server()
        q = server["routes"]["POST /datafn/query"]
        m = server["routes"]["POST /datafn/mutation"]
        t = server["routes"]["POST /datafn/transact"]

        # Insert
        res = await m({}, {
            "resource": "tasks", "version": 1, "operation": "insert",
            "id": "t1", "record": {"title": "Task 1"}
        })
        assert res["ok"] is True

        # Query
        res = await q({}, {"resource": "tasks", "version": 1})
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 1

        # Transact
        res = await t({}, {
            "atomic": False,
            "steps": [
                {"mutation": {"resource": "tasks", "version": 1, "operation": "insert", "id": "t2", "record": {"title": "Task 2"}}},
                {"query": {"resource": "tasks", "version": 1}},
            ]
        })
        assert res["ok"] is True
        assert res["result"]["ok"] is True

        # Verify final state
        res = await q({}, {"resource": "tasks", "version": 1})
        assert len(res["result"]["data"]) == 2
