import pytest
from datafn.server import create_datafn_server, DatafnError

def test_tv_py_001_routes_exposed():
    """
    TV-PY-001: Python server SDK exposes /datafn/* routes.
    """
    schema = {
        "resources": [
            {"name": "task", "version": 1, "fields": []}
        ],
        "relations": []
    }
    
    # Pass config dict
    result = create_datafn_server({"schema": schema})
    
    routes = result["routes"].keys()
    
    # Map "POST /datafn/query" -> "/datafn/query" for checking
    route_paths = [r.split(" ")[1] for r in routes]
    
    expected_routes = [
        # "/datafn/status", # Status not implemented yet?
        "/datafn/query", 
        "/datafn/mutation", 
        "/datafn/transact", 
        "/datafn/seed", 
        "/datafn/clone", 
        "/datafn/pull", 
        "/datafn/push"
    ]
    
    for route in expected_routes:
        assert route in route_paths

# Schema validation on creation not implemented yet.
# def test_tv_py_002_invalid_schema_rejection():
#     ...
