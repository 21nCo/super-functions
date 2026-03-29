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
async def test_query_valid():
    db = MockAdapter()
    await db.create("tasks", {"id": "1", "title": "Task 1"})
    
    server = create_datafn_server({"schema": schema, "db": db})
    handler = server["routes"]["POST /datafn/query"]
    
    res = await handler({}, {"resource": "tasks", "version": 1, "select": ["title"]})
    
    assert res["ok"] is True
    assert len(res["result"]["data"]) == 1
    assert res["result"]["data"][0]["title"] == "Task 1"

@pytest.mark.asyncio
async def test_query_invalid_json():
    # Caller should parse JSON. If passed not dict:
    server = create_datafn_server({"schema": schema, "db": MockAdapter()})
    handler = server["routes"]["POST /datafn/query"]
    
    res = await handler({}, "invalid")
    assert res["ok"] is False
    assert res["error"]["code"] == "DFQL_INVALID"

@pytest.mark.asyncio
async def test_query_unknown_resource():
    server = create_datafn_server({"schema": schema, "db": MockAdapter()})
    handler = server["routes"]["POST /datafn/query"]
    
    res = await handler({}, {"resource": "unknown", "version": 1})
    assert res["ok"] is False
    assert res["error"]["code"] == "DFQL_UNKNOWN_RESOURCE"
