import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

schema = {
    "resources": [
        {"name": "tasks", "fields": [{"name": "title"}]}
    ],
    "relations": []
}

@pytest.mark.asyncio
async def test_mutation_valid():
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/mutation"]
    
    res = await handler({}, {
        "resource": "tasks",
        "version": 1,
        "operation": "insert",
        "clientId": "c1",
        "mutationId": "m1",
        "id": "t1",
        "record": {"title": "Task 1"}
    })
    
    assert res["ok"] is True
    assert res["result"]["ok"] is True
    
    # Check DB
    tasks = await db.find_many("tasks", [])
    assert len(tasks) == 1
    assert tasks[0]["title"] == "Task 1"

@pytest.mark.asyncio
async def test_mutation_idempotency():
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/mutation"]
    
    payload = {
        "resource": "tasks",
        "version": 1,
        "operation": "insert",
        "clientId": "c1",
        "mutationId": "m1",
        "id": "t1",
        "record": {"title": "Task 1"}
    }
    
    # First call
    res1 = await handler({}, payload)
    assert res1["ok"] is True
    
    # Second call
    res2 = await handler({}, payload)
    assert res2["ok"] is True
    assert res2["result"]["deduped"] is True
    
    # Check DB (only 1 insert)
    tasks = await db.find_many("tasks", [])
    assert len(tasks) == 1
