import pytest
from datafn.filters import evaluate_filter, normalize_filter_ops, OP_REMAP
from datafn.envelope import DatafnError


class TestFilterOperators:
    # TV-FILT-001: $in
    def test_in_positive(self):
        assert evaluate_filter({"status": "active"}, {"status": {"$in": ["active", "pending"]}})

    def test_in_negative(self):
        assert not evaluate_filter({"status": "closed"}, {"status": {"$in": ["active", "pending"]}})

    # TV-FILT-002: $nin
    def test_nin_positive(self):
        assert evaluate_filter({"status": "closed"}, {"status": {"$nin": ["active", "pending"]}})

    def test_nin_negative(self):
        assert not evaluate_filter({"status": "active"}, {"status": {"$nin": ["active", "pending"]}})

    # TV-FILT-003: $like (case-sensitive)
    def test_like_positive(self):
        assert evaluate_filter({"name": "Hello World"}, {"name": {"$like": "Hello%"}})

    def test_like_negative_case(self):
        assert not evaluate_filter({"name": "hello world"}, {"name": {"$like": "Hello%"}})

    def test_like_underscore(self):
        assert evaluate_filter({"name": "cat"}, {"name": {"$like": "c_t"}})
        assert not evaluate_filter({"name": "coat"}, {"name": {"$like": "c_t"}})

    # TV-FILT-004: $ilike (case-insensitive)
    def test_ilike_positive(self):
        assert evaluate_filter({"name": "Hello World"}, {"name": {"$ilike": "hello%"}})

    # $not_like / $not_ilike
    def test_not_like(self):
        assert evaluate_filter({"name": "hello"}, {"name": {"$not_like": "Hello%"}})
        assert not evaluate_filter({"name": "Hello World"}, {"name": {"$not_like": "Hello%"}})

    def test_not_ilike(self):
        assert not evaluate_filter({"name": "Hello World"}, {"name": {"$not_ilike": "hello%"}})

    # TV-FILT-005: $is_null
    def test_is_null_true(self):
        assert evaluate_filter({"email": None}, {"email": {"$is_null": True}})

    def test_is_null_false(self):
        assert not evaluate_filter({"email": "test@example.com"}, {"email": {"$is_null": True}})

    def test_is_null_inverse(self):
        assert evaluate_filter({"email": "test@example.com"}, {"email": {"$is_null": False}})

    # $is_not_null
    def test_is_not_null(self):
        assert evaluate_filter({"email": "test@example.com"}, {"email": {"$is_not_null": True}})
        assert not evaluate_filter({"email": None}, {"email": {"$is_not_null": True}})

    # TV-FILT-006: $is_empty
    def test_is_empty_none(self):
        assert evaluate_filter({"tags": None}, {"tags": {"$is_empty": True}})

    def test_is_empty_string(self):
        assert evaluate_filter({"name": ""}, {"name": {"$is_empty": True}})

    def test_is_empty_list(self):
        assert evaluate_filter({"items": []}, {"items": {"$is_empty": True}})

    def test_is_empty_negative(self):
        assert not evaluate_filter({"name": "hello"}, {"name": {"$is_empty": True}})

    # $is_not_empty
    def test_is_not_empty(self):
        assert evaluate_filter({"name": "hello"}, {"name": {"$is_not_empty": True}})
        assert not evaluate_filter({"name": ""}, {"name": {"$is_not_empty": True}})

    # TV-FILT-007: $contains / $startsWith / $endsWith
    def test_contains(self):
        assert evaluate_filter({"title": "Hello World"}, {"title": {"$contains": "lo Wor"}})

    def test_starts_with(self):
        assert evaluate_filter({"title": "Hello World"}, {"title": {"$startsWith": "Hello"}})

    def test_ends_with(self):
        assert evaluate_filter({"title": "Hello World"}, {"title": {"$endsWith": "World"}})

    def test_starts_with_negative(self):
        assert not evaluate_filter({"title": "Hello World"}, {"title": {"$startsWith": "World"}})

    # TV-FILT-008: $before / $after
    def test_before(self):
        assert evaluate_filter({"createdAt": 1704067200000}, {"createdAt": {"$before": 1704153600000}})

    def test_after(self):
        assert evaluate_filter({"createdAt": 1704153600000}, {"createdAt": {"$after": 1704067200000}})

    # TV-FILT-009: $between / $not_between
    def test_between(self):
        assert evaluate_filter({"priority": 5}, {"priority": {"$between": [3, 7]}})

    def test_between_boundary(self):
        assert evaluate_filter({"priority": 3}, {"priority": {"$between": [3, 7]}})
        assert evaluate_filter({"priority": 7}, {"priority": {"$between": [3, 7]}})

    def test_not_between(self):
        assert not evaluate_filter({"priority": 5}, {"priority": {"$not_between": [3, 7]}})
        assert evaluate_filter({"priority": 1}, {"priority": {"$not_between": [3, 7]}})

    # TV-FILT-010: Null values with comparison operators
    def test_null_comparison(self):
        assert not evaluate_filter({"score": None}, {"score": {"$gt": 5}})
        assert not evaluate_filter({"score": None}, {"score": {"$lt": 5}})
        assert not evaluate_filter({"score": None}, {"score": {"$gte": 5}})
        assert not evaluate_filter({"score": None}, {"score": {"$lte": 5}})

    # Basic existing operators
    def test_eq(self):
        assert evaluate_filter({"x": 1}, {"x": {"$eq": 1}})
        assert not evaluate_filter({"x": 2}, {"x": {"$eq": 1}})

    def test_ne(self):
        assert evaluate_filter({"x": 2}, {"x": {"$ne": 1}})

    def test_gt(self):
        assert evaluate_filter({"x": 5}, {"x": {"$gt": 3}})
        assert not evaluate_filter({"x": 3}, {"x": {"$gt": 3}})

    def test_gte(self):
        assert evaluate_filter({"x": 3}, {"x": {"$gte": 3}})

    def test_lt(self):
        assert evaluate_filter({"x": 2}, {"x": {"$lt": 3}})

    def test_lte(self):
        assert evaluate_filter({"x": 3}, {"x": {"$lte": 3}})

    # Direct equality (shorthand)
    def test_direct_equality(self):
        assert evaluate_filter({"status": "active"}, {"status": "active"})
        assert not evaluate_filter({"status": "closed"}, {"status": "active"})


class TestNormalizeFilterOps:
    # TV-FILT-011
    def test_remap_basic(self):
        result = normalize_filter_ops({"status": {"eq": "active"}, "priority": {"gte": 3, "lte": 10}})
        assert result == {"status": {"$eq": "active"}, "priority": {"$gte": 3, "$lte": 10}}

    def test_already_prefixed(self):
        result = normalize_filter_ops({"status": {"$eq": "active"}})
        assert result == {"status": {"$eq": "active"}}

    def test_nested_remap(self):
        result = normalize_filter_ops({"$and": [{"status": {"eq": "active"}}, {"priority": {"gt": 3}}]})
        assert result == {"$and": [{"status": {"$eq": "active"}}, {"priority": {"$gt": 3}}]}

    def test_non_operator_keys_preserved(self):
        result = normalize_filter_ops({"status": {"eq": "active"}, "name": "test"})
        assert result == {"status": {"$eq": "active"}, "name": "test"}


class TestLogicalOperators:
    # TV-FILT-012: $and
    def test_and_positive(self):
        record = {"status": "active", "priority": 5}
        assert evaluate_filter(record, {"$and": [{"status": {"$eq": "active"}}, {"priority": {"$gte": 3}}]})

    def test_and_negative(self):
        record = {"status": "closed", "priority": 5}
        assert not evaluate_filter(record, {"$and": [{"status": {"$eq": "active"}}, {"priority": {"$gte": 3}}]})

    def test_and_empty(self):
        assert evaluate_filter({"x": 1}, {"$and": []})

    # TV-FILT-013: $or
    def test_or_positive(self):
        record = {"status": "closed", "priority": 5}
        assert evaluate_filter(record, {"$or": [{"status": {"$eq": "active"}}, {"priority": {"$gte": 3}}]})

    def test_or_negative(self):
        record = {"status": "closed", "priority": 1}
        assert not evaluate_filter(record, {"$or": [{"status": {"$eq": "active"}}, {"priority": {"$gte": 3}}]})

    def test_or_empty(self):
        assert not evaluate_filter({"x": 1}, {"$or": []})

    def test_nested_logical(self):
        record = {"a": 1, "b": 2, "c": 3}
        filt = {"$and": [{"$or": [{"a": {"$eq": 1}}, {"a": {"$eq": 2}}]}, {"b": {"$eq": 2}}]}
        assert evaluate_filter(record, filt)


class TestDotPath:
    # TV-FILT-014
    def test_dot_path_positive(self):
        assert evaluate_filter({"metadata": {"priority": 5}}, {"metadata.priority": {"$eq": 5}})

    def test_dot_path_missing_key(self):
        assert not evaluate_filter({"metadata": {}}, {"metadata.priority": {"$eq": 5}})

    def test_dot_path_deep(self):
        record = {"a": {"b": {"c": 42}}}
        assert evaluate_filter(record, {"a.b.c": {"$eq": 42}})

    def test_dot_path_missing_intermediate(self):
        assert not evaluate_filter({"x": 1}, {"a.b.c": {"$eq": 42}})


class TestFilterDepth:
    # TV-FILT-015
    def test_depth_limit_exceeded(self):
        # Build 11 levels of $and nesting
        filt = {"x": {"$eq": 1}}
        for _ in range(11):
            filt = {"$and": [filt]}

        with pytest.raises(DatafnError) as exc_info:
            evaluate_filter({"x": 1}, filt)
        assert exc_info.value.code == "LIMIT_EXCEEDED"
        assert "depth" in exc_info.value.message.lower()

    def test_within_depth_limit(self):
        # Build 9 levels - should be fine
        filt = {"x": {"$eq": 1}}
        for _ in range(9):
            filt = {"$and": [filt]}
        assert evaluate_filter({"x": 1}, filt)


class TestNonPrefixedOpsInEvaluate:
    def test_legacy_operators_work(self):
        assert evaluate_filter({"x": 1}, {"x": {"eq": 1}})
        assert evaluate_filter({"x": 5}, {"x": {"gt": 3}})
        assert evaluate_filter({"x": 5}, {"x": {"gte": 5}})
        assert evaluate_filter({"x": 5}, {"x": {"lt": 10}})
        assert evaluate_filter({"x": 5}, {"x": {"lte": 5}})
        assert evaluate_filter({"x": 2}, {"x": {"ne": 1}})
