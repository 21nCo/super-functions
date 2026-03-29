from typing import Any, Dict, List, Optional


def calculate_aggregation(op: str, field: str, records: List[Dict[str, Any]]) -> Any:
    if op == "count":
        return len(records)

    values = [r.get(field) for r in records if r.get(field) is not None]

    if not values:
        return None

    if op == "sum":
        return sum(values)
    elif op == "avg":
        return sum(values) / len(values)
    elif op == "min":
        return min(values)
    elif op == "max":
        return max(values)
    else:
        raise ValueError(f"Unknown aggregation operation: {op}")
