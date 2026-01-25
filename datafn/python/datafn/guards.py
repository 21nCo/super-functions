from typing import Any, Dict
from .db import Adapter
from .filters import evaluate_filter

async def evaluate_guard(db: Adapter, resource: str, record_id: str, guard: Dict[str, Any], namespace: str = "datafn") -> bool:
    try:
        record = await db.find_one(
            model=resource,
            where=[{"field": "id", "operator": "eq", "value": record_id}],
            namespace=namespace
        )
        if not record:
            return False # Guard on non-existent record fails
            
        return evaluate_filter(record, guard)
    except Exception:
        return False
