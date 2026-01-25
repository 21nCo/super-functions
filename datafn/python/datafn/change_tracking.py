from typing import Any, Dict, List, Optional
from .db import Adapter
from .transaction import with_transaction
import time

# Tables
CHANGES_TABLE = "__datafn_changes"
SEQ_TABLE = "__datafn_server_seq"

async def get_next_server_seq(db: Adapter, namespace: str = "datafn") -> int:
    """
    Returns the next monotonic server sequence number.
    Uses a transaction to ensure atomicity.
    """
    async def _increment(tx_db: Adapter) -> int:
        # 1. Get current seq
        record = await tx_db.find_one(SEQ_TABLE, [{"field": "id", "operator": "eq", "value": namespace}], namespace=namespace)
        
        current_seq = 0
        if record:
            current_seq = int(record.get("seq", 0))
            
        next_seq = current_seq + 1
        
        # 2. Update or Create
        if record:
            await tx_db.update(
                SEQ_TABLE,
                [{"field": "id", "operator": "eq", "value": namespace}],
                {"seq": next_seq},
                namespace=namespace
            )
        else:
            await tx_db.create(
                SEQ_TABLE,
                {"id": namespace, "seq": next_seq},
                namespace=namespace
            )
            
        return next_seq

    # Use transaction for atomic read-modify-write
    return await with_transaction(db, _increment)

async def write_change(
    db: Adapter, 
    namespace: str, 
    table: str, 
    operation: str, 
    record_id: str, 
    server_seq: int = 0
) -> None:
    """
    Writes a change record to the changelog.
    If server_seq is 0 (default), it generates a new one.
    """
    if server_seq == 0:
        server_seq = await get_next_server_seq(db, namespace)
        
    change_record = {
        "namespace": namespace,
        "table": table,
        "operation": operation,
        "recordId": record_id,
        "serverSeq": server_seq,
        "timestamp": int(time.time() * 1000)
    }
    
    # We might need an ID for the change record itself for DBs that require PK
    import uuid
    change_record["id"] = str(uuid.uuid4())
    
    await db.create(CHANGES_TABLE, change_record, namespace=namespace)

async def get_changes_since(
    db: Adapter, 
    namespace: str, 
    table: str, 
    cursor: Optional[str]
) -> Dict[str, Any]:
    """
    Returns changes for a table since the given cursor (serverSeq).
    """
    min_seq = int(cursor) if cursor else 0
    
    # Find changes > min_seq
    changes = await db.find_many(
        CHANGES_TABLE,
        where=[
            {"field": "namespace", "operator": "eq", "value": namespace},
            {"field": "table", "operator": "eq", "value": table},
            {"field": "serverSeq", "operator": "gt", "value": min_seq}
        ],
        sort=["serverSeq:asc"],
        namespace=namespace
    )
    
    # Determine new cursor
    new_cursor = cursor
    if changes:
        last_seq = changes[-1]["serverSeq"]
        new_cursor = str(last_seq)
        
    return {
        "changes": changes,
        "cursor": new_cursor
    }

async def get_latest_cursor(db: Adapter, namespace: str, table: str) -> Optional[str]:
    """
    Gets the latest serverSeq for a table.
    """
    changes = await db.find_many(
        CHANGES_TABLE,
        where=[
            {"field": "namespace", "operator": "eq", "value": namespace},
            {"field": "table", "operator": "eq", "value": table}
        ],
        sort=["serverSeq:desc"],
        limit=1,
        namespace=namespace
    )
    
    if changes:
        return str(changes[0]["serverSeq"])
    return None # Or "0"? Spec says "return as string cursor"
