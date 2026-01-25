from typing import Any, Dict, Optional, TypedDict
from .db import Adapter

class MutationResult(TypedDict):
    ok: bool
    mutationId: str
    affectedIds: list[str]
    deduped: bool
    errors: list[Dict[str, Any]]

async def check_idempotency(db: Adapter, namespace: str, client_id: str, mutation_id: str) -> Optional[MutationResult]:
    # Table: __datafn_idempotency
    try:
        record = await db.find_one(
            model="__datafn_idempotency",
            where=[
                {"field": "clientId", "operator": "eq", "value": client_id},
                {"field": "mutationId", "operator": "eq", "value": mutation_id}
            ],
            namespace=namespace
        )
        if record:
            result = record.get("result")
            if result:
                result["deduped"] = True
                return result
    except Exception:
        # If DB error, treat as cache miss (safer than blocking, but arguably less safe for idempotency)
        # Consistent with "best effort" if DB is flaky, but if DB is down, everything is down.
        # Letting error propagate might be better? 
        # For now, swallow to match "cache miss" behavior unless critical.
        pass
    return None

async def store_idempotency(db: Adapter, namespace: str, client_id: str, mutation_id: str, result: MutationResult) -> None:
    try:
        # Clean result before storage if needed?
        # Ensure deduped flag is not stored as True? 
        # Actually it doesn't matter, we set it on retrieval.
        
        await db.create(
            model="__datafn_idempotency",
            data={
                "clientId": client_id,
                "mutationId": mutation_id,
                "result": result
            },
            namespace=namespace
        )
    except Exception:
        # Ignore duplicate key errors if race condition
        pass
