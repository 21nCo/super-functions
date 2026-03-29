from typing import Any, Dict, Optional
from .db import Adapter
from .filters import evaluate_filter


async def evaluate_guard(
    db: Adapter,
    resource: str,
    record_id: str,
    guard: Dict[str, Any],
    namespace: str = "datafn",
    tx_db: Optional[Adapter] = None,
) -> bool:
    """
    Evaluate a guard condition against a record.
    Uses tx_db if provided (for transactional guard evaluation), otherwise db.
    """
    try:
        use_db = tx_db if tx_db is not None else db
        record = await use_db.find_one(
            model=resource,
            where=[{"field": "id", "operator": "eq", "value": record_id}],
            namespace=namespace
        )
        if not record:
            return False  # Guard on non-existent record fails

        return evaluate_filter(record, guard)
    except Exception:
        return False
