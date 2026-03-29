import re
from typing import Any, Dict, List, Optional

# Remap non-$-prefixed operators to $-prefixed form
OP_REMAP = {
    "eq": "$eq",
    "ne": "$ne",
    "gt": "$gt",
    "gte": "$gte",
    "lt": "$lt",
    "lte": "$lte",
    "in": "$in",
    "not_in": "$nin",
    "nin": "$nin",
    "like": "$like",
    "ilike": "$ilike",
    "not_like": "$not_like",
    "not_ilike": "$not_ilike",
    "is_null": "$is_null",
    "is_not_null": "$is_not_null",
    "is_empty": "$is_empty",
    "is_not_empty": "$is_not_empty",
    "contains": "$contains",
    "startsWith": "$startsWith",
    "endsWith": "$endsWith",
    "before": "$before",
    "after": "$after",
    "between": "$between",
    "not_between": "$not_between",
}


def normalize_filter_ops(filters: Any) -> Any:
    if isinstance(filters, dict):
        result = {}
        for key, value in filters.items():
            if key in ("$and", "$or"):
                result[key] = [normalize_filter_ops(item) for item in value] if isinstance(value, list) else value
            elif not key.startswith("$") and key in OP_REMAP:
                result[OP_REMAP[key]] = normalize_filter_ops(value)
            else:
                result[key] = normalize_filter_ops(value)
        return result
    if isinstance(filters, list):
        return [normalize_filter_ops(item) for item in filters]
    return filters


def _like_to_regex(pattern: str, flags: int = 0) -> re.Pattern:
    # Convert SQL LIKE pattern to regex:
    # Process char by char to handle % and _ before escaping other chars
    result = []
    for ch in pattern:
        if ch == "%":
            result.append(".*")
        elif ch == "_":
            result.append(".")
        else:
            result.append(re.escape(ch))
    regex_str = "".join(result)
    return re.compile(f"^{regex_str}$", flags)


def _get_nested_value(record: Dict[str, Any], path: str) -> Any:
    parts = path.split(".")
    current = record
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _evaluate_operator(value: Any, op: str, operand: Any) -> bool:
    if op == "$eq":
        return value == operand
    if op == "$ne":
        return value != operand
    if op == "$is_null":
        return (value is None) == bool(operand)
    if op == "$is_not_null":
        if operand:
            return value is not None
        return value is None
    if op == "$is_empty":
        is_empty = value is None or value == "" or value == []
        return is_empty == bool(operand)
    if op == "$is_not_empty":
        is_empty = value is None or value == "" or value == []
        if operand:
            return not is_empty
        return is_empty

    # For remaining operators, None values return False
    if value is None:
        return False

    if op == "$gt":
        try:
            return value > operand
        except TypeError:
            return False
    if op == "$gte":
        try:
            return value >= operand
        except TypeError:
            return False
    if op == "$lt":
        try:
            return value < operand
        except TypeError:
            return False
    if op == "$lte":
        try:
            return value <= operand
        except TypeError:
            return False
    if op == "$in":
        if not isinstance(operand, (list, tuple, set)):
            return False
        return value in operand
    if op == "$nin":
        if not isinstance(operand, (list, tuple, set)):
            return False
        return value not in operand
    if op == "$like":
        if not isinstance(value, str) or not isinstance(operand, str):
            return False
        return bool(_like_to_regex(operand).match(value))
    if op == "$ilike":
        if not isinstance(value, str) or not isinstance(operand, str):
            return False
        return bool(_like_to_regex(operand, re.IGNORECASE).match(value))
    if op == "$not_like":
        if not isinstance(value, str) or not isinstance(operand, str):
            return False
        return not bool(_like_to_regex(operand).match(value))
    if op == "$not_ilike":
        if not isinstance(value, str) or not isinstance(operand, str):
            return False
        return not bool(_like_to_regex(operand, re.IGNORECASE).match(value))
    if op == "$contains":
        if isinstance(value, str) and isinstance(operand, str):
            return operand in value
        if isinstance(value, list):
            return operand in value
        return False
    if op == "$startsWith":
        if not isinstance(value, str) or not isinstance(operand, str):
            return False
        return value.startswith(operand)
    if op == "$endsWith":
        if not isinstance(value, str) or not isinstance(operand, str):
            return False
        return value.endswith(operand)
    if op == "$before":
        try:
            return value < operand
        except TypeError:
            return False
    if op == "$after":
        try:
            return value > operand
        except TypeError:
            return False
    if op == "$between":
        if not isinstance(operand, (list, tuple)) or len(operand) != 2:
            return False
        lower, upper = operand
        try:
            return lower <= value <= upper
        except TypeError:
            return False
    if op == "$not_between":
        if not isinstance(operand, (list, tuple)) or len(operand) != 2:
            return False
        lower, upper = operand
        try:
            return not (lower <= value <= upper)
        except TypeError:
            return False

    # Unknown operator - reject instead of silently matching everything
    return False


def evaluate_filter(
    record: Dict[str, Any],
    filters: Dict[str, Any],
    max_depth: int = 10,
    _current_depth: int = 0,
) -> bool:
    if _current_depth > max_depth:
        from .envelope import DatafnError
        raise DatafnError(
            code="LIMIT_EXCEEDED",
            message=f"Filter depth exceeds maximum of {max_depth}",
        )

    for key, value in filters.items():
        if key == "$and":
            if not isinstance(value, list):
                return False
            if len(value) == 0:
                continue  # Empty $and is true
            if not all(isinstance(f, dict) for f in value):
                return False
            if not all(
                evaluate_filter(record, f, max_depth, _current_depth + 1)
                for f in value
            ):
                return False
            continue
        if key == "$or":
            if not isinstance(value, list):
                return False
            if len(value) == 0:
                return False  # Empty $or is false
            if not all(isinstance(f, dict) for f in value):
                return False
            if not any(
                evaluate_filter(record, f, max_depth, _current_depth + 1)
                for f in value
            ):
                return False
            continue

        # Get record value — supports dot-path traversal
        if "." in key:
            record_val = _get_nested_value(record, key)
        else:
            record_val = record.get(key)

        if isinstance(value, dict):
            for op, op_val in value.items():
                actual_op = OP_REMAP.get(op, op) if not op.startswith("$") else op
                if not _evaluate_operator(record_val, actual_op, op_val):
                    return False
        else:
            if record_val != value:
                return False

    return True
