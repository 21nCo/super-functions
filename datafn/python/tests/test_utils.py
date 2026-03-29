import pytest
from datetime import datetime, timezone

from datafn.utils.sort import parse_sort_terms, sort_records
from datafn.utils.select import parse_select_token, apply_select, apply_omit
from datafn.utils.date import to_epoch_ms, from_epoch_ms, coerce_date_fields_to_epoch
from datafn.utils.aggregate import calculate_aggregation
from datafn.utils.normalize import normalize_dfql, dfql_key
from datafn.utils.joins import get_join_table_name, get_join_store_key, enumerate_join_store_keys
from datafn.utils.ns import ns
from datafn.utils.validate_fields import check_prototype_pollution, validate_field_value


# --- Sort ---

class TestParseSortTerms:
    # TV-SORT-001
    def test_parse_all_formats(self):
        result = parse_sort_terms(["name", "priority:desc", "-createdAt", "id:asc"])
        assert result == [
            {"field": "name", "direction": "asc"},
            {"field": "priority", "direction": "desc"},
            {"field": "createdAt", "direction": "desc"},
            {"field": "id", "direction": "asc"},
        ]

    def test_single_field(self):
        assert parse_sort_terms(["id"]) == [{"field": "id", "direction": "asc"}]

    def test_empty(self):
        assert parse_sort_terms([]) == []


class TestSortRecords:
    # TV-SORT-002: Null handling
    def test_sort_with_nulls_asc(self):
        records = [
            {"id": "3", "name": None},
            {"id": "1", "name": "Alice"},
            {"id": "2", "name": "Bob"},
        ]
        result = sort_records(records, [{"field": "name", "direction": "asc"}])
        assert [r["id"] for r in result] == ["1", "2", "3"]

    def test_sort_with_nulls_desc(self):
        records = [
            {"id": "3", "name": None},
            {"id": "1", "name": "Alice"},
            {"id": "2", "name": "Bob"},
        ]
        result = sort_records(records, [{"field": "name", "direction": "desc"}])
        assert [r["id"] for r in result] == ["3", "2", "1"]

    # TV-SORT-003: Tie-breaking
    def test_tie_breaking_by_id(self):
        records = [
            {"id": "c", "priority": 1},
            {"id": "a", "priority": 1},
            {"id": "b", "priority": 1},
        ]
        result = sort_records(records, [{"field": "priority", "direction": "asc"}])
        assert [r["id"] for r in result] == ["a", "b", "c"]

    def test_multi_field_sort(self):
        records = [
            {"id": "1", "status": "b", "priority": 2},
            {"id": "2", "status": "a", "priority": 1},
            {"id": "3", "status": "a", "priority": 2},
        ]
        result = sort_records(records, [
            {"field": "status", "direction": "asc"},
            {"field": "priority", "direction": "desc"},
        ])
        assert [r["id"] for r in result] == ["3", "2", "1"]


# --- Select ---

class TestParseSelectToken:
    # TV-SEL-001
    def test_simple(self):
        result = parse_select_token("id")
        assert result == {"path": ["id"], "base_name": "id", "directive": None}

    def test_wildcard(self):
        result = parse_select_token("tags.*")
        assert result == {"path": ["tags", "*"], "base_name": "tags", "directive": "*"}

    def test_nested(self):
        result = parse_select_token("metadata.name")
        assert result == {"path": ["metadata", "name"], "base_name": "metadata", "directive": None}


class TestApplySelect:
    # TV-SEL-002
    def test_select_whitelist(self):
        records = [{"id": "1", "title": "Task 1", "description": "desc", "priority": 5}]
        result = apply_select(records, ["id", "title"])
        assert result == [{"id": "1", "title": "Task 1"}]

    def test_id_always_included(self):
        records = [{"id": "1", "title": "Task 1", "priority": 5}]
        result = apply_select(records, ["title"])
        assert result == [{"id": "1", "title": "Task 1"}]


class TestApplyOmit:
    # TV-SEL-003
    def test_omit_blacklist(self):
        records = [{"id": "1", "title": "Task 1", "description": "desc", "priority": 5}]
        result = apply_omit(records, ["description"])
        assert result == [{"id": "1", "title": "Task 1", "priority": 5}]

    def test_id_never_omitted(self):
        records = [{"id": "1", "title": "Task 1"}]
        result = apply_omit(records, ["id"])
        assert result == [{"id": "1", "title": "Task 1"}]


# --- Date ---

class TestDateUtils:
    # TV-DATE-001
    def test_iso_string(self):
        assert to_epoch_ms("2024-01-01T00:00:00Z") == 1704067200000

    def test_epoch_int(self):
        assert to_epoch_ms(1704067200000) == 1704067200000

    def test_datetime_object(self):
        dt = datetime(2024, 1, 1, tzinfo=timezone.utc)
        assert to_epoch_ms(dt) == 1704067200000

    def test_invalid_date(self):
        with pytest.raises(ValueError):
            to_epoch_ms("not-a-date")

    def test_from_epoch_ms(self):
        dt = from_epoch_ms(1704067200000)
        assert dt.year == 2024
        assert dt.month == 1
        assert dt.day == 1
        assert dt.tzinfo == timezone.utc

    def test_coerce_date_fields(self):
        record = {"createdAt": "2024-01-01T00:00:00Z", "name": "test"}
        coerce_date_fields_to_epoch(record, ["createdAt"])
        assert record["createdAt"] == 1704067200000
        assert record["name"] == "test"

    def test_coerce_skips_none(self):
        record = {"createdAt": None}
        coerce_date_fields_to_epoch(record, ["createdAt"])
        assert record["createdAt"] is None

    def test_coerce_skips_missing(self):
        record = {"name": "test"}
        coerce_date_fields_to_epoch(record, ["createdAt"])
        assert "createdAt" not in record


# --- Aggregation ---

class TestAggregation:
    # TV-AGG-001
    records = [
        {"id": "1", "score": 10},
        {"id": "2", "score": 20},
        {"id": "3", "score": None},
        {"id": "4", "score": 30},
    ]

    def test_count(self):
        assert calculate_aggregation("count", "score", self.records) == 4

    def test_sum(self):
        assert calculate_aggregation("sum", "score", self.records) == 60

    def test_avg(self):
        assert calculate_aggregation("avg", "score", self.records) == 20.0

    def test_min(self):
        assert calculate_aggregation("min", "score", self.records) == 10

    def test_max(self):
        assert calculate_aggregation("max", "score", self.records) == 30

    def test_empty_set_count(self):
        assert calculate_aggregation("count", "score", []) == 0

    def test_empty_set_sum(self):
        assert calculate_aggregation("sum", "score", []) is None

    def test_empty_set_avg(self):
        assert calculate_aggregation("avg", "score", []) is None

    def test_empty_set_min(self):
        assert calculate_aggregation("min", "score", []) is None

    def test_empty_set_max(self):
        assert calculate_aggregation("max", "score", []) is None

    def test_all_nulls_sum(self):
        records = [{"id": "1", "score": None}, {"id": "2", "score": None}]
        assert calculate_aggregation("sum", "score", records) is None


# --- Normalize ---

class TestNormalize:
    # TV-NORM-001
    def test_normalize_sorts_keys(self):
        result = normalize_dfql({"b": 2, "a": 1, "c": {"z": 3, "y": 2}})
        assert list(result.keys()) == ["a", "b", "c"]
        assert list(result["c"].keys()) == ["y", "z"]

    def test_dfql_key(self):
        result = dfql_key({"b": 2, "a": 1, "c": {"z": 3, "y": 2}})
        assert result == '{"a":1,"b":2,"c":{"y":2,"z":3}}'

    def test_preserves_none(self):
        result = normalize_dfql({"a": None, "b": 1})
        assert result == {"a": None, "b": 1}

    def test_normalizes_lists(self):
        result = normalize_dfql({"a": [{"b": 2, "a": 1}]})
        assert list(result["a"][0].keys()) == ["a", "b"]


# --- Joins ---

class TestJoinUtils:
    # TV-JOIN-001
    def test_join_table_name(self):
        assert get_join_table_name("tasks", "tags") == "__datafn_join_tasks_tags"

    def test_join_table_name_custom(self):
        assert get_join_table_name("tasks", "tags", join_table="custom_join") == "custom_join"

    def test_join_store_key(self):
        assert get_join_store_key("tasks", "tags", "tags") == "join_tasks_tags_tags"

    def test_enumerate_join_store_keys(self):
        relations = [
            {"from": "tasks", "to": "tags", "type": "many-many", "relation": "tags"},
            {"from": "tasks", "to": "projects", "type": "many-one", "relation": "project"},
        ]
        keys = enumerate_join_store_keys(relations)
        assert len(keys) == 1
        assert keys[0]["joinTable"] == "__datafn_join_tasks_tags"
        assert keys[0]["storeKey"] == "join_tasks_tags_tags"

    def test_enumerate_with_filter(self):
        relations = [
            {"from": "tasks", "to": "tags", "type": "many-many", "relation": "tags"},
            {"from": "users", "to": "roles", "type": "many-many", "relation": "roles"},
        ]
        keys = enumerate_join_store_keys(relations, resource_filter="tasks")
        assert len(keys) == 1
        assert keys[0]["from"] == "tasks"


# --- Namespace ---

class TestNs:
    # TV-NS-001
    def test_basic(self):
        assert ns("org-acme", "user-123") == "org-acme:user-123"

    def test_empty_segments_skipped(self):
        assert ns("org", "", "user") == "org:user"

    def test_single(self):
        assert ns("org") == "org"

    def test_no_args_raises(self):
        with pytest.raises(ValueError):
            ns()

    def test_all_empty_raises(self):
        with pytest.raises(ValueError):
            ns("", "")


# --- Validate Fields ---

class TestPrototypePollution:
    # TV-VAL-008
    def test_proto_detected(self):
        assert check_prototype_pollution({"__proto__": {"isAdmin": True}, "title": "hack"}) == "__proto__"

    def test_constructor_detected(self):
        assert check_prototype_pollution({"constructor": {}}) == "constructor"

    def test_prototype_detected(self):
        assert check_prototype_pollution({"prototype": {}}) == "prototype"

    def test_nested_detection(self):
        assert check_prototype_pollution({"data": {"__proto__": {}}}) == "__proto__"

    def test_clean_record(self):
        assert check_prototype_pollution({"title": "safe", "data": {"nested": True}}) is None

    def test_array_detection(self):
        assert check_prototype_pollution([{"__proto__": {}}]) == "__proto__"


class TestValidateFieldValue:
    # TV-VAL-005 (partial - the type validation utility)
    def test_string(self):
        assert validate_field_value("string", "hello")
        assert not validate_field_value("string", 123)

    def test_number(self):
        assert validate_field_value("number", 42)
        assert validate_field_value("number", 3.14)
        assert not validate_field_value("number", "42")
        assert not validate_field_value("number", True)

    def test_boolean(self):
        assert validate_field_value("boolean", True)
        assert validate_field_value("boolean", False)
        assert not validate_field_value("boolean", 1)

    def test_date(self):
        assert validate_field_value("date", 1704067200000)
        assert validate_field_value("date", "2024-01-01T00:00:00Z")
        assert validate_field_value("date", datetime(2024, 1, 1, tzinfo=timezone.utc))
        assert not validate_field_value("date", [])

    def test_object(self):
        assert validate_field_value("object", {"key": "value"})
        assert not validate_field_value("object", "string")

    def test_array(self):
        assert validate_field_value("array", [1, 2, 3])
        assert not validate_field_value("array", "string")

    def test_json(self):
        assert validate_field_value("json", "anything")
        assert validate_field_value("json", 42)
        assert validate_field_value("json", {"key": "value"})

    def test_nullable(self):
        assert validate_field_value("string", None, nullable=True)
        assert not validate_field_value("string", None, nullable=False)

    def test_unknown_type(self):
        assert validate_field_value("custom_type", "anything")
