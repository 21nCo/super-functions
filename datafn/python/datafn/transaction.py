from typing import Any, Callable, TypeVar, Awaitable
from .db import Adapter

T = TypeVar("T")

async def with_transaction(db: Adapter, callback: Callable[[Adapter], Awaitable[T]]) -> T:
    """
    Executes callback within a transaction.
    """
    # Assuming db.transaction() returns an AsyncContextManager that yields an adapter.
    # If the adapter doesn't implement transaction(), we might need fallback?
    # But protocol says it does.
    
    # Check if db has transaction method (runtime check for safety?)
    if not hasattr(db, "transaction"):
        # Fallback: just run without transaction (atomic=False behavior really, but if requested...)
        # Or raise error?
        # For now assume it adheres to protocol.
        # But if it's atomic=True, we expect transaction support.
        return await callback(db)

    async with db.transaction() as tx_db:
        return await callback(tx_db)
