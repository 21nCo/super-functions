"""Small async concurrency helpers for bounded fan-out."""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Iterable, TypeVar, cast

T = TypeVar("T")
R = TypeVar("R")


def resolve_concurrency(value: int | None, fallback: int) -> int:
    """Resolve a positive bounded concurrency value."""
    if value is None:
        return fallback
    return max(1, int(value))


async def map_with_concurrency(
    items: Iterable[T],
    concurrency: int,
    worker: Callable[[T, int], Awaitable[R]],
) -> list[R]:
    """Map items with bounded async concurrency while preserving order."""
    indexed_items = list(items)
    if not indexed_items:
        return []

    results: list[R | None] = [None] * len(indexed_items)
    semaphore = asyncio.Semaphore(max(1, min(concurrency, len(indexed_items))))

    async def run(item: T, index: int) -> None:
        async with semaphore:
            results[index] = await worker(item, index)

    await asyncio.gather(
        *(run(item, index) for index, item in enumerate(indexed_items))
    )

    return cast(list[R], results)
