from __future__ import annotations

from typing import Any

import pytest

from searchfn import index_data, search_index


class FakeDb:
    def __init__(self) -> None:
        self.records: dict[str, list[dict[str, Any]]] = {
            "article": [
                {"id": "1", "title": "Hello Search"},
                {"id": "2", "title": "Search Search World"},
            ],
            "_searchfn_index": [],
        }

    async def find_many(self, table: str, where: list[dict[str, Any]], limit: int | None = None) -> list[dict[str, Any]]:
        rows = list(self.records.get(table, []))
        for clause in where:
            rows = [row for row in rows if row.get(clause["field"]) == clause["value"]]
        return rows[:limit] if limit is not None else rows

    async def create(self, table: str, value: dict[str, Any]) -> dict[str, Any]:
        self.records.setdefault(table, []).append(value)
        return value

    async def delete(self, table: str, where: list[dict[str, Any]]) -> None:
        rows = self.records.get(table, [])
        self.records[table] = [
            row
            for row in rows
            if not all(row.get(clause["field"]) == clause["value"] for clause in where)
        ]


@pytest.mark.asyncio
async def test_index_data_creates_index_rows_for_string_fields() -> None:
    schema = {
        "models": {
            "article": {
                "fields": {
                    "title": {"type": "string"},
                    "views": {"type": "number"},
                }
            }
        }
    }
    db = FakeDb()

    result = await index_data(schema, db)

    assert result == {"totalIndexed": 2, "totalTerms": 5}
    assert len(db.records["_searchfn_index"]) == 5


@pytest.mark.asyncio
async def test_search_index_ranks_results_by_match_count() -> None:
    db = FakeDb()
    db.records["_searchfn_index"] = [
        {"term": "search", "model": "article", "recordId": "1", "field": "title"},
        {"term": "hello", "model": "article", "recordId": "1", "field": "title"},
        {"term": "search", "model": "article", "recordId": "2", "field": "title"},
        {"term": "search", "model": "article", "recordId": "2", "field": "subtitle"},
        {"term": "world", "model": "article", "recordId": "2", "field": "title"},
    ]

    result = await search_index(schema=None, db=db, query="search world")

    assert [item["id"] for item in result] == ["2", "1"]
    assert result[0]["score"] == 3
    assert result[0]["matches"] == ["search", "world"]
