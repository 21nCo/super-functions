import pytest
from datafn.validation import (
    SchemaIndex, validate_schema, validate_record_types,
    validate_required_fields, apply_defaults,
    validate_query_limits, validate_mutation_limits,
    validate_id_length, validate_record_keys,
)
from datafn.envelope import classify_error, DatafnError, CONFLICT, NOT_FOUND, INTERNAL
from datafn.server import create_datafn_server


# --- Helpers ---

def make_schema(resources=None, relations=None):
    return {
        "resources": resources or [
            {"name": "tasks", "version": 1, "fields": [
                {"name": "title", "type": "string", "required": True},
                {"name": "status", "type": "string", "default": "pending"},
                {"name": "priority", "type": "number"},
                {"name": "done", "type": "boolean"},
                {"name": "dueDate", "type": "date"},
                {"name": "metadata", "type": "object"},
                {"name": "tags", "type": "array"},
                {"name": "config", "type": "json"},
                {"name": "readonlyField", "type": "string", "readonly": True},
            ]}
        ],
        "relations": relations or [],
    }


# --- Schema Validation (VAL-001) ---

class TestValidateSchema:
    # TV-VAL-001
    def test_valid_schema(self):
        result = validate_schema(make_schema())
        assert result["ok"] is True

    # TV-VAL-002
    def test_duplicate_resource(self):
        schema = {
            "resources": [
                {"name": "tasks", "version": 1, "fields": []},
                {"name": "tasks", "version": 1, "fields": []},
            ],
            "relations": [],
        }
        result = validate_schema(schema)
        assert result["ok"] is False
        assert result["error"]["code"] == "SCHEMA_INVALID"

    def test_missing_resources(self):
        result = validate_schema({})
        assert result["ok"] is False

    def test_empty_resources(self):
        result = validate_schema({"resources": []})
        assert result["ok"] is False

    def test_too_many_resources(self):
        resources = [{"name": f"r{i}", "fields": []} for i in range(101)]
        result = validate_schema({"resources": resources})
        assert result["ok"] is False
        assert "maximum is 100" in result["error"]["message"]

    def test_duplicate_field_names(self):
        schema = {
            "resources": [
                {"name": "tasks", "fields": [
                    {"name": "title"},
                    {"name": "title"},
                ]}
            ],
            "relations": [],
        }
        result = validate_schema(schema)
        assert result["ok"] is False
        assert "Duplicate field" in result["error"]["message"]

    def test_too_many_fields(self):
        fields = [{"name": f"f{i}"} for i in range(201)]
        schema = {"resources": [{"name": "tasks", "fields": fields}], "relations": []}
        result = validate_schema(schema)
        assert result["ok"] is False

    def test_invalid_relation_reference(self):
        schema = {
            "resources": [{"name": "tasks", "fields": []}],
            "relations": [{"from": "tasks", "to": "nonexistent", "type": "many-one", "relation": "parent"}],
        }
        result = validate_schema(schema)
        assert result["ok"] is False
        assert "nonexistent" in result["error"]["message"]

    def test_server_raises_on_invalid_schema(self):
        from tests.mock_db import MockAdapter
        with pytest.raises(DatafnError) as exc_info:
            create_datafn_server({"schema": {}, "db": MockAdapter()})
        assert exc_info.value.code == "SCHEMA_INVALID"


# --- FK Field Injection (VAL-002) ---

class TestFKInjection:
    # TV-VAL-003
    def test_fk_field_injected(self):
        schema = {
            "resources": [
                {"name": "tasks", "fields": [{"name": "title", "type": "string"}]},
                {"name": "projects", "fields": [{"name": "name", "type": "string"}]},
            ],
            "relations": [
                {"from": "tasks", "to": "projects", "type": "many-one", "relation": "project"},
            ],
        }
        index = SchemaIndex(schema)
        assert "projectId" in index.writable_fields_by_resource["tasks"]
        assert "projectId" in index.fields_by_resource["tasks"]

    def test_custom_fk_field(self):
        schema = {
            "resources": [
                {"name": "tasks", "fields": []},
                {"name": "projects", "fields": []},
            ],
            "relations": [
                {"from": "tasks", "to": "projects", "type": "many-one", "relation": "project", "fkField": "proj_id"},
            ],
        }
        index = SchemaIndex(schema)
        assert "proj_id" in index.writable_fields_by_resource["tasks"]

    def test_fk_schema_has_correct_type(self):
        schema = {
            "resources": [
                {"name": "tasks", "fields": []},
                {"name": "projects", "fields": []},
            ],
            "relations": [
                {"from": "tasks", "to": "projects", "type": "many-one", "relation": "project"},
            ],
        }
        index = SchemaIndex(schema)
        fk_schema = index.field_schemas["tasks"]["projectId"]
        assert fk_schema["type"] == "string"
        assert fk_schema["required"] is False


# --- Read-only Fields (VAL-003) ---

class TestReadonlyFields:
    # TV-VAL-004
    def test_readonly_tracked(self):
        index = SchemaIndex(make_schema())
        assert "id" in index.readonly_fields["tasks"]
        assert "createdAt" in index.readonly_fields["tasks"]
        assert "readonlyField" in index.readonly_fields["tasks"]
        assert "title" not in index.readonly_fields["tasks"]

    def test_readonly_field_rejected_in_record(self):
        index = SchemaIndex(make_schema())
        err = validate_record_keys(index, "tasks", {"createdAt": 12345}, "record")
        assert err is not None
        assert err.code == "DFQL_INVALID"
        assert "read-only" in err.message

    def test_id_allowed_in_record(self):
        index = SchemaIndex(make_schema())
        err = validate_record_keys(index, "tasks", {"id": "t1", "title": "test"}, "record")
        assert err is None


# --- Field Type Validation (VAL-004) ---

class TestRecordTypeValidation:
    # TV-VAL-005
    def test_valid_types(self):
        index = SchemaIndex(make_schema())
        errors = validate_record_types(
            {"title": "test", "priority": 5, "done": True, "dueDate": 1704067200000},
            "tasks", index
        )
        assert errors == []

    def test_wrong_type(self):
        index = SchemaIndex(make_schema())
        errors = validate_record_types({"title": 123}, "tasks", index)
        assert len(errors) == 1
        assert "title" in errors[0]
        assert "string" in errors[0]

    def test_no_type_spec_passes(self):
        schema = {"resources": [{"name": "items", "fields": [{"name": "data"}]}], "relations": []}
        index = SchemaIndex(schema)
        errors = validate_record_types({"data": 42}, "items", index)
        assert errors == []


# --- Required Fields (VAL-005) ---

class TestRequiredFields:
    # TV-VAL-006
    def test_missing_required(self):
        index = SchemaIndex(make_schema())
        missing = validate_required_fields({}, "tasks", index)
        assert "title" in missing

    def test_required_with_value(self):
        index = SchemaIndex(make_schema())
        missing = validate_required_fields({"title": "test"}, "tasks", index)
        assert missing == []

    def test_required_with_default_not_required(self):
        # status has default, so it's not required even though it could be
        index = SchemaIndex(make_schema())
        missing = validate_required_fields({}, "tasks", index)
        assert "status" not in missing


# --- Default Values (VAL-006) ---

class TestDefaults:
    # TV-VAL-007
    def test_apply_default(self):
        index = SchemaIndex(make_schema())
        record = {"title": "Task 1"}
        apply_defaults(record, "tasks", index)
        assert record["status"] == "pending"

    def test_default_not_overwritten(self):
        index = SchemaIndex(make_schema())
        record = {"title": "Task 1", "status": "active"}
        apply_defaults(record, "tasks", index)
        assert record["status"] == "active"


# --- Limit Enforcement (VAL-008) ---

class TestLimitEnforcement:
    # TV-VAL-009
    def test_select_limit(self):
        query = {"select": [f"f{i}" for i in range(51)]}
        err = validate_query_limits(query, {"maxSelectTokens": 50})
        assert err is not None
        assert err.code == "LIMIT_EXCEEDED"

    def test_sort_limit(self):
        query = {"sort": [f"f{i}" for i in range(11)]}
        err = validate_query_limits(query, {"maxSortFields": 10})
        assert err is not None
        assert err.code == "LIMIT_EXCEEDED"

    def test_filter_keys_limit(self):
        filters = {f"field{i}": {"$eq": i} for i in range(21)}
        query = {"filters": filters}
        err = validate_query_limits(query, {"maxFilterKeysPerLevel": 20})
        assert err is not None
        assert err.code == "LIMIT_EXCEEDED"

    def test_aggregation_limit(self):
        aggs = {f"agg{i}": {"count": "*"} for i in range(11)}
        query = {"aggregations": aggs}
        err = validate_query_limits(query, {"maxAggregations": 10})
        assert err is not None
        assert err.code == "LIMIT_EXCEEDED"

    def test_batch_limit(self):
        mutation = {"records": [{"id": f"r{i}"} for i in range(101)]}
        err = validate_mutation_limits(mutation, {"maxBatchSize": 100})
        assert err is not None
        assert err.code == "LIMIT_EXCEEDED"

    def test_within_limits(self):
        query = {"select": ["a", "b"], "sort": ["id"], "filters": {"x": {"$eq": 1}}, "aggregations": {}}
        err = validate_query_limits(query, {})
        assert err is None


# --- ID Length Validation (VAL-009) ---

class TestIdLength:
    # TV-VAL-010
    def test_valid_id(self):
        err = validate_id_length("short_id", 255)
        assert err is None

    def test_oversized_id(self):
        err = validate_id_length("x" * 300, 255)
        assert err is not None
        assert err.code == "DFQL_INVALID"
        assert "255" in err.message

    def test_none_id(self):
        err = validate_id_length(None, 255)
        assert err is None


# --- Error Classification (MUT-004) ---

class TestErrorClassification:
    # TV-MUT-004
    def test_duplicate_key(self):
        assert classify_error(Exception("UNIQUE constraint failed: tasks.id")) == CONFLICT

    def test_duplicate_key_postgres(self):
        assert classify_error(Exception("duplicate key value violates unique constraint")) == CONFLICT

    def test_not_found(self):
        assert classify_error(Exception("Record not found")) == NOT_FOUND

    def test_unknown(self):
        assert classify_error(Exception("Something random")) == INTERNAL


# --- SchemaIndex Tracking ---

class TestSchemaIndexTracking:
    def test_date_fields_tracked(self):
        index = SchemaIndex(make_schema())
        assert "dueDate" in index.date_fields["tasks"]

    def test_field_schemas_stored(self):
        index = SchemaIndex(make_schema())
        assert "title" in index.field_schemas["tasks"]
        assert index.field_schemas["tasks"]["title"]["type"] == "string"

    def test_required_fields_tracked(self):
        index = SchemaIndex(make_schema())
        assert "title" in index.required_fields["tasks"]
        # status has default, so not in required
        assert "status" not in index.required_fields["tasks"]

    def test_defaults_tracked(self):
        index = SchemaIndex(make_schema())
        assert index.field_defaults["tasks"]["status"] == "pending"
