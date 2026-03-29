from typing import Any, Dict, Optional, TypedDict
from .db import Adapter
from .envelope import CONFLICT, classify_error
from .logger import DatafnLogger

class MutationResult(TypedDict):
    ok: bool
    mutationId: str
    affectedIds: list[str]
    deduped: bool
    errors: list[Dict[str, Any]]

async def check_idempotency(
    db: Adapter,
    namespace: str,
    client_id: str,
    mutation_id: str,
    logger: Optional[DatafnLogger] = None,
) -> Optional[MutationResult]:
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
            stored = record.get("result")
            if isinstance(stored, dict):
                result = dict(stored)
                result["deduped"] = True
                return result
    except Exception as exc:
        if logger:
            logger.warn(
                "Idempotency lookup failed",
                {
                    "namespace": namespace,
                    "clientId": client_id,
                    "mutationId": mutation_id,
                    "error": str(exc),
                },
            )
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
    except Exception as exc:
        # Ignore duplicate key errors if race condition
        if classify_error(exc) != CONFLICT:
            raise
