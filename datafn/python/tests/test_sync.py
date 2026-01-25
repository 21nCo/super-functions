import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter

schema = {
    "resources": [
        {"name": "tasks", "fields": [{"name": "title"}, {"name": "status"}]},
        # Tables for sync (implicit or explicit in schema?)
        # datafn code doesn't check schema for __datafn tables unless we call validate_resource on them?
        # Handlers access them directly via DB.
        # But if we use validate_resource on user tables, they must be in schema.
    ],
    "relations": []
}

@pytest.mark.asyncio
async def test_seed():
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/seed"]
    
    # 1. First Seed
    res = await handler({}, {"clientId": "c1"})
    assert res["ok"] is True
    
    # Check DB
    seeds = await db.find_many("__datafn_seed", [])
    assert len(seeds) == 1
    assert seeds[0]["id"] == "c1"
    
    # 2. Repeated Seed
    res2 = await handler({}, {"clientId": "c1"})
    assert res2["ok"] is True
    
    # DB still has 1
    seeds = await db.find_many("__datafn_seed", [])
    assert len(seeds) == 1

@pytest.mark.asyncio
async def test_push_and_change_tracking():
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    push_handler = server["routes"]["POST /datafn/push"]
    
    # Push a mutation
    payload = {
        "clientId": "c1",
        "mutations": [
            {
                "resource": "tasks",
                "version": "1",
                "clientId": "c1",
                "mutationId": "m1",
                "operation": "insert",
                "id": "t1",
                "record": {"title": "Task 1"}
            }
        ]
    }
    
    res = await push_handler({}, payload)
    assert res["ok"] is True
    assert res["result"]["applied"] == ["m1"]
    
    # Verify Data
    tasks = await db.find_many("tasks", [])
    assert len(tasks) == 1
    assert tasks[0]["title"] == "Task 1"
    
    # Verify Change Tracking
    changes = await db.find_many("__datafn_changes", [])
    assert len(changes) == 1
    assert changes[0]["table"] == "tasks"
    assert changes[0]["operation"] == "insert"
    assert changes[0]["recordId"] == "t1"
    assert changes[0]["serverSeq"] > 0
    
    # Verify Server Seq Table
    seqs = await db.find_many("__datafn_server_seq", [])
    assert len(seqs) == 1
    assert seqs[0]["seq"] >= 1

@pytest.mark.asyncio
async def test_pull():
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    push_handler = server["routes"]["POST /datafn/push"]
    pull_handler = server["routes"]["POST /datafn/pull"]
    
    # 1. Push data
    await push_handler({}, {
        "clientId": "c1",
        "mutations": [
            {"resource": "tasks", "version": "1", "clientId": "c1", "mutationId": "m1", "operation": "insert", "id": "t1", "record": {"title": "T1"}},
            {"resource": "tasks", "version": "1", "clientId": "c1", "mutationId": "m2", "operation": "insert", "id": "t2", "record": {"title": "T2"}}
        ]
    })
    
    # 2. Pull from beginning
    res = await pull_handler({}, {"clientId": "c2", "cursors": {}})
    assert res["ok"] is True
    data = res["result"]
    
    assert len(data["records"]["tasks"]) == 2
    assert "t1" in [r["id"] for r in data["records"]["tasks"]]
    assert "t2" in [r["id"] for r in data["records"]["tasks"]]
    
    cursor = data["cursors"]["tasks"]
    assert int(cursor) >= 2
    
    # 3. Pull from cursor
    res2 = await pull_handler({}, {"clientId": "c2", "cursors": {"tasks": cursor}})
    assert res2["ok"] is True
    # Should be empty
    if "tasks" in res2["result"]["records"]:
         assert len(res2["result"]["records"]["tasks"]) == 0

@pytest.mark.asyncio
async def test_clone():
    db = MockAdapter()
    server = create_datafn_server({"schema": schema, "db": db})
    push_handler = server["routes"]["POST /datafn/push"]
    clone_handler = server["routes"]["POST /datafn/clone"]
    
    # 1. Push data
    await push_handler({}, {
        "clientId": "c1",
        "mutations": [
            {"resource": "tasks", "version": "1", "clientId": "c1", "mutationId": "m1", "operation": "insert", "id": "t1", "record": {"title": "T1"}}
        ]
    })
    
    # 2. Clone
    res = await clone_handler({}, {"clientId": "c2", "tables": ["tasks"]})
    assert res["ok"] is True
    
    assert len(res["result"]["data"]["tasks"]) == 1
    assert res["result"]["data"]["tasks"][0]["title"] == "T1"
    assert "tasks" in res["result"]["cursors"]
