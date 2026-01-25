from typing import Any, Dict, List, Optional, AsyncContextManager
import copy

class MockTransactionContext:
    def __init__(self, adapter):
        self.adapter = adapter
        self.snapshot = None

    async def __aenter__(self):
        # Create a snapshot of data
        self.snapshot = copy.deepcopy(self.adapter.data)
        # Return the same adapter instance (simplification) 
        # In real life, we might return a transaction object or bound adapter.
        # But MockAdapter stores data in memory.
        return self.adapter

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            # Rollback: restore snapshot
            self.adapter.data = self.snapshot
        else:
            # Commit: keep changes (do nothing)
            pass
        self.snapshot = None

class MockAdapter:
    def __init__(self):
        self.data = {} # model -> list of records

    async def find_many(
        self, 
        model: str, 
        where: List[Dict[str, Any]], 
        limit: Optional[int] = None,
        sort: Optional[List[str]] = None,
        cursor: Optional[Dict[str, Any]] = None,
        namespace: str = "datafn"
    ) -> List[Dict[str, Any]]:
        records = self.data.get(model, [])
        filtered = []
        for r in records:
            match = True
            for w in where:
                field = w["field"]
                op = w.get("operator", "eq")
                val = w.get("value")
                
                rv = r.get(field)
                if op == "eq":
                    if rv != val: match = False
                elif op == "gt":
                    if not (rv > val): match = False
                elif op == "gte":
                    if not (rv >= val): match = False
                elif op == "lt":
                    if not (rv < val): match = False
                elif op == "lte":
                    if not (rv <= val): match = False
                # Add other ops if needed for tests
            if match:
                filtered.append(r)
        
        # Sort?
        # Only simple sort for now if needed by tests
        if sort:
            # Sort by first field
            field = sort[0].split(":")[0]
            desc = "desc" in sort[0]
            filtered.sort(key=lambda x: x.get(field, ""), reverse=desc)
            
        if limit:
            filtered = filtered[:limit]
            
        return filtered

    async def find_one(self, model: str, where: List[Dict[str, Any]], namespace: str = "datafn") -> Optional[Dict[str, Any]]:
        # Reuse logic?
        res = await self.find_many(model, where, limit=1, namespace=namespace)
        return res[0] if res else None

    async def create(self, model: str, data: Dict[str, Any], namespace: str = "datafn") -> None:
        if model not in self.data: self.data[model] = []
        # Ensure ID?
        if "id" not in data:
            import uuid
            data["id"] = str(uuid.uuid4())
        self.data[model].append(data)

    async def update(self, model: str, where: List[Dict[str, Any]], data: Dict[str, Any], namespace: str = "datafn") -> None:
        record = await self.find_one(model, where, namespace)
        if record:
            record.update(data)
            
    async def delete(self, model: str, where: List[Dict[str, Any]], namespace: str = "datafn") -> None:
        record = await self.find_one(model, where, namespace)
        if record:
            self.data[model].remove(record)

    def transaction(self) -> AsyncContextManager["MockAdapter"]:
        return MockTransactionContext(self)
