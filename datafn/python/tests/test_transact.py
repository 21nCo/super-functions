import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

schema = {
    "resources": [
        {"name": "tasks", "fields": [{"name": "title"}, {"name": "status"}]}
    ],
    "relations": []
}

@pytest.mark.asyncio
async def test_transact_atomic_commit():
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
            },
            {
                "mutation": {
                    "resource": "tasks",
                    "operation": "insert",
                    "clientId": "c1",
                    "mutationId": "m2",
                    "id": "t2",
                    "record": {"title": "Task 2"}
                }
            }
        ]
    }
    
    res = await handler({}, payload)
    assert res["ok"] is True
    assert len(res["result"]["results"]) == 2
    
    # Verify DB
    tasks = await db.find_many("tasks", [])
    assert len(tasks) == 2

@pytest.mark.asyncio
async def test_transact_atomic_rollback():
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
            },
            {
                "mutation": {
                    "resource": "tasks",
                    "operation": "insert",
                    "clientId": "c1",
                    "mutationId": "m2",
                    # Missing required ID for update, or generally invalid Op to trigger error
                    # Let's trigger schema validation error (missing 'id' for update/insert?)
                    # Wait, 'id' is in payload but maybe 'record' missing field?
                    # Schema doesn't enforce required fields in tests unless we add check.
                    # Let's use invalid operation.
                    "operation": "invalid_op",
                    "record": {}
                }
            }
        ]
    }
    
    res = await handler({}, payload)
    
    # Should fail overall
    assert res["ok"] is False
    assert res["error"]["code"] == "DFQL_INVALID"
    
    # Verify DB (Rollback)
    tasks = await db.find_many("tasks", [])
    assert len(tasks) == 0

@pytest.mark.asyncio
async def test_transact_read_your_writes():
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
                    "record": {"title": "RYW Task"}
                }
            },
            {
                "query": {
                    "resource": "tasks",
                    "filters": {"title": "RYW Task"}
                }
            }
        ]
    }
    
    res = await handler({}, payload)
    assert res["ok"] is True
    results = res["result"]["results"]
    
    # Mutation result
    assert results[0]["mutationId"] == "m1"
    
    # Query result should see the task
    assert len(results[1]["data"]) == 1
    assert results[1]["data"][0]["title"] == "RYW Task"

@pytest.mark.asyncio
async def test_transact_step_limit():
    db = MockAdapter()
    config = {"schema": schema, "db": db, "limits": {"maxTransactSteps": 2}}
    server = create_datafn_server(config)
    handler = server["routes"]["POST /datafn/transact"]
    
    payload = {
        "steps": [{}, {}, {}] # 3 steps
    }
    
    res = await handler({}, payload)
    assert res["ok"] is False
    assert res["error"]["code"] == "LIMIT_EXCEEDED"
