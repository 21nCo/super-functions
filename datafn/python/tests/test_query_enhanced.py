import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

schema = {
    "resources": [
        {"name": "tasks", "fields": [
            {"name": "title", "type": "string"},
            {"name": "status", "type": "string"},
            {"name": "priority", "type": "number"},
            {"name": "description", "type": "string"},
        ]}
    ],
    "relations": [],
}


async def _setup(records=None, limits=None):
    db = MockAdapter()
    if records:
        for r in records:
            await db.create("tasks", r)
    config = {"schema": schema, "db": db}
    if limits:
        config["limits"] = limits
    server = create_datafn_server(config)
    return server["routes"]["POST /datafn/query"]


# --- Default Sort (SORT-003 / TV-SORT-004) ---

class TestDefaultSort:
    @pytest.mark.asyncio
    async def test_no_sort_defaults_to_id_asc(self):
        handler = await _setup([
            {"id": "c", "title": "C"},
            {"id": "a", "title": "A"},
            {"id": "b", "title": "B"},
        ])
        res = await handler({}, {"resource": "tasks", "version": 1})
        assert res["ok"] is True
        ids = [r["id"] for r in res["result"]["data"]]
        assert ids == ["a", "b", "c"]


# --- Forward Cursor (QRY-001 / TV-QRY-001) ---

class TestForwardCursor:
    @pytest.mark.asyncio
    async def test_cursor_after(self):
        handler = await _setup([
            {"id": "task_1", "title": "T1", "priority": 8},
            {"id": "task_2", "title": "T2", "priority": 5},
            {"id": "task_3", "title": "T3", "priority": 5},
            {"id": "task_4", "title": "T4", "priority": 3},
            {"id": "task_5", "title": "T5", "priority": 1},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "sort": ["priority:desc", "id"],
            "limit": 2,
            "cursor": {"after": {"priority": 5, "id": "task_3"}},
        })
        assert res["ok"] is True
        ids = [r["id"] for r in res["result"]["data"]]
        assert ids == ["task_4", "task_5"]
        assert res["result"]["nextCursor"] is None

    @pytest.mark.asyncio
    async def test_cursor_after_with_more(self):
        handler = await _setup([
            {"id": f"t{i}", "title": f"Task {i}", "priority": i}
            for i in range(1, 6)
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "sort": ["id"],
            "limit": 2,
            "cursor": {"after": {"id": "t1"}},
        })
        assert res["ok"] is True
        ids = [r["id"] for r in res["result"]["data"]]
        assert ids == ["t2", "t3"]
        assert res["result"]["nextCursor"] is not None


# --- Backward Cursor (QRY-002 / TV-QRY-002) ---

class TestBackwardCursor:
    @pytest.mark.asyncio
    async def test_cursor_before(self):
        handler = await _setup([
            {"id": "task_1", "title": "T1"},
            {"id": "task_2", "title": "T2"},
            {"id": "task_3", "title": "T3"},
            {"id": "task_4", "title": "T4"},
            {"id": "task_5", "title": "T5"},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "sort": ["id"],
            "limit": 2,
            "cursor": {"before": {"id": "task_4"}},
        })
        assert res["ok"] is True
        ids = [r["id"] for r in res["result"]["data"]]
        assert ids == ["task_2", "task_3"]


# --- nextCursor (QRY-003 / TV-QRY-003) ---

class TestNextCursor:
    @pytest.mark.asyncio
    async def test_next_cursor_present(self):
        handler = await _setup([
            {"id": f"task_{i}", "title": f"T{i}"}
            for i in range(1, 6)
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "limit": 2,
        })
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 2
        assert res["result"]["nextCursor"] is not None
        assert res["result"]["nextCursor"]["id"] == "task_2"

    @pytest.mark.asyncio
    async def test_next_cursor_null_at_end(self):
        handler = await _setup([
            {"id": "task_1", "title": "T1"},
            {"id": "task_2", "title": "T2"},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "limit": 5,
        })
        assert res["ok"] is True
        assert res["result"]["nextCursor"] is None


# --- Offset (QRY-004 / TV-QRY-004) ---

class TestOffset:
    @pytest.mark.asyncio
    async def test_offset_pagination(self):
        handler = await _setup([
            {"id": f"task_{i}", "title": f"T{i}"}
            for i in range(1, 6)
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "limit": 2, "offset": 2,
        })
        assert res["ok"] is True
        ids = [r["id"] for r in res["result"]["data"]]
        assert ids == ["task_3", "task_4"]


# --- Limit Clamping (QRY-005 / TV-QRY-005) ---

class TestLimitClamping:
    @pytest.mark.asyncio
    async def test_limit_clamped_to_max(self):
        handler = await _setup(
            [{"id": f"t{i}", "title": f"T{i}"} for i in range(1, 11)],
            limits={"maxLimit": 3},
        )
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "limit": 100,
        })
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 3

    @pytest.mark.asyncio
    async def test_no_limit_uses_max(self):
        handler = await _setup(
            [{"id": f"t{i}", "title": f"T{i}"} for i in range(1, 11)],
            limits={"maxLimit": 5},
        )
        res = await handler({}, {"resource": "tasks", "version": 1})
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 5


# --- Count (QRY-006 / TV-QRY-006) ---

class TestCount:
    @pytest.mark.asyncio
    async def test_count_with_limit(self):
        handler = await _setup([
            {"id": f"t{i}", "title": f"T{i}"}
            for i in range(1, 11)
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "count": True, "limit": 2,
        })
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 2
        assert res["result"]["count"] == 10

    @pytest.mark.asyncio
    async def test_count_not_present_when_false(self):
        handler = await _setup([{"id": "t1", "title": "T1"}])
        res = await handler({}, {"resource": "tasks", "version": 1})
        assert "count" not in res["result"]


# --- Aggregation (QRY-007 / TV-QRY-007) ---

class TestAggregation:
    @pytest.mark.asyncio
    async def test_group_by_with_aggregation(self):
        handler = await _setup([
            {"id": "1", "title": "T1", "status": "active", "priority": 5},
            {"id": "2", "title": "T2", "status": "active", "priority": 3},
            {"id": "3", "title": "T3", "status": "closed", "priority": 1},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "groupBy": ["status"],
            "aggregations": {"total": {"count": "*"}, "avgPriority": {"avg": "priority"}},
        })
        assert res["ok"] is True
        data = res["result"]["data"]
        active = next(r for r in data if r["status"] == "active")
        closed = next(r for r in data if r["status"] == "closed")
        assert active["total"] == 2
        assert active["avgPriority"] == 4.0
        assert closed["total"] == 1
        assert closed["avgPriority"] == 1.0

    @pytest.mark.asyncio
    async def test_aggregation_without_group_by(self):
        handler = await _setup([
            {"id": "1", "title": "T1", "priority": 10},
            {"id": "2", "title": "T2", "priority": 20},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "aggregations": {"total": {"count": "*"}, "sumPriority": {"sum": "priority"}},
        })
        assert res["ok"] is True
        row = res["result"]["data"][0]
        assert row["total"] == 2
        assert row["sumPriority"] == 30

    @pytest.mark.asyncio
    async def test_having_filter(self):
        handler = await _setup([
            {"id": "1", "title": "T1", "status": "active", "priority": 5},
            {"id": "2", "title": "T2", "status": "active", "priority": 3},
            {"id": "3", "title": "T3", "status": "closed", "priority": 1},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "groupBy": ["status"],
            "aggregations": {"total": {"count": "*"}},
            "having": {"total": {"$gte": 2}},
        })
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 1
        assert res["result"]["data"][0]["status"] == "active"


# --- Select/Omit (QRY-008, SEL-002 / TV-SEL-002, TV-SEL-003) ---

class TestSelectOmit:
    @pytest.mark.asyncio
    async def test_select_whitelist(self):
        handler = await _setup([
            {"id": "1", "title": "Task 1", "description": "desc", "priority": 5},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "select": ["id", "title"],
        })
        assert res["ok"] is True
        record = res["result"]["data"][0]
        assert set(record.keys()) == {"id", "title"}

    @pytest.mark.asyncio
    async def test_omit_blacklist(self):
        handler = await _setup([
            {"id": "1", "title": "Task 1", "description": "desc", "priority": 5},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "omit": ["description"],
        })
        assert res["ok"] is True
        record = res["result"]["data"][0]
        assert "description" not in record
        assert "title" in record

    @pytest.mark.asyncio
    async def test_select_and_omit_together_error(self):
        handler = await _setup([{"id": "1", "title": "T1"}])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "select": ["title"],
            "omit": ["description"],
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "DFQL_INVALID"


# --- Cursor Sort Validation (QRY-009 / TV-QRY-008) ---

class TestCursorSortValidation:
    @pytest.mark.asyncio
    async def test_cursor_auto_appends_id(self):
        handler = await _setup([
            {"id": "1", "title": "T1", "priority": 5},
            {"id": "2", "title": "T2", "priority": 3},
        ])
        # Sort without id — should auto-append
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "sort": ["priority"],
            "cursor": {"after": {"priority": 5, "id": "1"}},
            "limit": 10,
        })
        assert res["ok"] is True


# --- Query Limits (VAL-008 / TV-VAL-009) ---

class TestQueryLimits:
    @pytest.mark.asyncio
    async def test_max_select_tokens(self):
        handler = await _setup([], limits={"maxSelectTokens": 3})
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "select": ["id", "title", "status", "priority"],
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "LIMIT_EXCEEDED"

    @pytest.mark.asyncio
    async def test_max_sort_fields(self):
        handler = await _setup([], limits={"maxSortFields": 1})
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "sort": ["title", "priority"],
        })
        assert res["ok"] is False
        assert res["error"]["code"] == "LIMIT_EXCEEDED"


# --- Filtering ---

class TestFiltering:
    @pytest.mark.asyncio
    async def test_filter_eq(self):
        handler = await _setup([
            {"id": "1", "title": "T1", "status": "active"},
            {"id": "2", "title": "T2", "status": "closed"},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "filters": {"status": {"$eq": "active"}},
        })
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 1
        assert res["result"]["data"][0]["id"] == "1"

    @pytest.mark.asyncio
    async def test_filter_with_non_prefixed_ops(self):
        handler = await _setup([
            {"id": "1", "title": "T1", "priority": 5},
            {"id": "2", "title": "T2", "priority": 3},
        ])
        res = await handler({}, {
            "resource": "tasks", "version": 1,
            "filters": {"priority": {"gte": 5}},
        })
        assert res["ok"] is True
        assert len(res["result"]["data"]) == 1
