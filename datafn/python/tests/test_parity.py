import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

# Schema for parity tests
schema = {
    "resources": [
        {"name": "tasks", "fields": [{"name": "title"}, {"name": "status"}]},
        {"name": "__datafn_idempotency", "fields": [{"name": "clientId"}, {"name": "mutationId"}, {"name": "result"}]}
    ],
    "relations": []
}

@pytest.mark.asyncio
async def test_parity_response_format():
    """
    Ensure response format matches TS: { ok: bool, result?: ..., error?: ... }
    """
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/query"]
    
    # Valid query
    res = await handler({}, {"resource": "tasks", "version": 1})
    assert "ok" in res
    assert res["ok"] is True
    assert "result" in res
    assert "data" in res["result"]
    assert "nextCursor" in res["result"]

@pytest.mark.asyncio
async def test_parity_error_format():
    """
    Ensure error format matches TS: { ok: False, error: { code, message, details: { path } } }
    """
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/query"]
    
    # Invalid resource
    res = await handler({}, {"resource": "unknown", "version": 1})
    assert res["ok"] is False
    assert "error" in res
    assert "code" in res["error"]
    assert res["error"]["code"] == "DFQL_UNKNOWN_RESOURCE"
    assert "details" in res["error"]
    assert "path" in res["error"]["details"]

@pytest.mark.asyncio
async def test_parity_idempotency_persistence():
    """
    TV-PY-IDEMP-PERSIST-001: Idempotency is persisted to DB.
    """
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/mutation"]
    
    payload = {
        "resource": "tasks",
        "version": 1,
        "operation": "insert",
        "clientId": "client-parity",
        "mutationId": "mut-parity-1",
        "id": "t1",
        "record": {"title": "Task 1"}
    }
    
    # 1. Execute
    await handler({}, payload)
    
    # 2. Check DB directly
    # __datafn_idempotency table should have record
    recs = await db.find_many("__datafn_idempotency", [])
    assert len(recs) == 1
    assert recs[0]["clientId"] == "client-parity"
    assert recs[0]["mutationId"] == "mut-parity-1"
    
    # 3. Replay
    res2 = await handler({}, payload)
    assert res2["result"]["deduped"] is True

@pytest.mark.asyncio
async def test_transact_parity():
    """
    Contract test for Transact.
    Ensures output structure matches expected TS format.
    """
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/transact"]
    
    payload = {
        "atomic": True,
        "steps": [
            {
                "mutation": {
                    "resource": "tasks",
                    "operation": "insert",
                    "clientId": "c1",
                    "mutationId": "m1",
                    "id": "t1",
                    "record": {"title": "Task 1"}
                }
            }
        ]
    }
    
    res = await handler({}, payload)
    assert res["ok"] is True
    assert "result" in res
    assert res["result"]["ok"] is True
    assert isinstance(res["result"]["results"], list)
    assert len(res["result"]["results"]) == 1
    
    # Inner result check
    inner = res["result"]["results"][0]
    assert inner["ok"] is True
    assert inner["mutationId"] == "m1"

@pytest.mark.asyncio
async def test_sync_parity():
    """
    Contract test for Sync endpoints (seed, clone, pull, push).
    """
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    
    # Seed
    seed_handler = server["routes"]["POST /datafn/seed"]
    res_seed = await seed_handler({}, {"clientId": "c1"})
    assert res_seed["ok"] is True
    
    # Push
    push_handler = server["routes"]["POST /datafn/push"]
    res_push = await push_handler({}, {
        "clientId": "c1",
        "mutations": [{
            "resource": "tasks", 
            "version": "1", 
            "clientId": "c1", 
            "mutationId": "m1", 
            "operation": "insert", 
            "id": "t1", 
            "record": {"title": "T1"}
        }]
    })
    assert res_push["ok"] is True
    assert "result" in res_push
    assert "applied" in res_push["result"]
    assert "errors" in res_push["result"]
    
    # Clone
    clone_handler = server["routes"]["POST /datafn/clone"]
    res_clone = await clone_handler({}, {"clientId": "c2", "tables": ["tasks"]})
    assert res_clone["ok"] is True
    assert "data" in res_clone["result"]
    assert "cursors" in res_clone["result"]
    assert isinstance(res_clone["result"]["data"], dict)
    
    # Pull
    pull_handler = server["routes"]["POST /datafn/pull"]
    res_pull = await pull_handler({}, {"clientId": "c2", "cursors": {}})
    assert res_pull["ok"] is True
    assert "records" in res_pull["result"]
    assert "deleted" in res_pull["result"]
    assert "cursors" in res_pull["result"]