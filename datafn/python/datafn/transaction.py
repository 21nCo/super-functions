from typing import Any, Callable, TypeVar, Awaitable
from .db import Adapter

T = TypeVar("T")

async def with_transaction(db: Adapter, callback: Callable[[Adapter], Awaitable[T]]) -> T:
    """
    Executes callback within a transaction.
    """
    # Runtime guard in case a custom adapter omits transaction().
    if not hasattr(db, "transaction"):
        # Run callback directly when transaction support is unavailable.
        return await callback(db)

    async with db.transaction() as tx_db:
        return await callback(tx_db)
