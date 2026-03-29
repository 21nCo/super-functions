"""
Phase 09: Bounded change fetching tests (PY-002)
Test vector: TV-PY-BOUND-001
"""

import pytest
from datafn.change_tracking import get_changes_since, write_change, get_next_server_seq
from .mock_db import MockAdapter


@pytest.mark.asyncio
async def test_get_changes_since_with_limit():
    """TV-PY-BOUND-001: get_changes_since with limit returns bounded results."""
    db = MockAdapter()
    namespace = "datafn"
    table = "task"

    # Seed 50 change entries
    for i in range(1, 51):
        seq = await get_next_server_seq(db, namespace)
        await write_change(db, namespace, table, "insert", f"t{i}", seq)

    # Fetch with limit=10
    result = await get_changes_since(db, namespace, table, "0", limit=10)
    assert len(result["changes"]) == 10
    # Should be ordered by serverSeq ASC (1-10)
    seqs = [c["serverSeq"] for c in result["changes"]]
    assert seqs == list(range(1, 11))
    # Cursor should point to seq 10
    assert result["cursor"] == "10"


@pytest.mark.asyncio
async def test_get_changes_since_without_limit():
    """TV-PY-BOUND-001 (backward compat): omitting limit returns all changes."""
    db = MockAdapter()
    namespace = "datafn"
    table = "task"

    # Seed 20 change entries
    for i in range(1, 21):
        seq = await get_next_server_seq(db, namespace)
        await write_change(db, namespace, table, "insert", f"t{i}", seq)

    # Fetch without limit
    result = await get_changes_since(db, namespace, table, "0")
    assert len(result["changes"]) == 20


@pytest.mark.asyncio
async def test_get_changes_since_limit_larger_than_data():
    """Limit larger than available changes returns all available."""
    db = MockAdapter()
    namespace = "datafn"
    table = "task"

    # Seed 5 entries
    for i in range(1, 6):
        seq = await get_next_server_seq(db, namespace)
        await write_change(db, namespace, table, "insert", f"t{i}", seq)

    result = await get_changes_since(db, namespace, table, "0", limit=100)
    assert len(result["changes"]) == 5


@pytest.mark.asyncio
async def test_get_changes_since_with_cursor_and_limit():
    """Limit applies after cursor filtering."""
    db = MockAdapter()
    namespace = "datafn"
    table = "task"

    # Seed 30 entries
    for i in range(1, 31):
        seq = await get_next_server_seq(db, namespace)
        await write_change(db, namespace, table, "insert", f"t{i}", seq)

    # Fetch from cursor "10" with limit=5 → should get seqs 11-15
    result = await get_changes_since(db, namespace, table, "10", limit=5)
    assert len(result["changes"]) == 5
    seqs = [c["serverSeq"] for c in result["changes"]]
    assert seqs == [11, 12, 13, 14, 15]
    assert result["cursor"] == "15"
