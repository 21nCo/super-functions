import json
from typing import Any


def normalize_dfql(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: normalize_dfql(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [normalize_dfql(v) for v in value]
    return value


def dfql_key(value: Any) -> str:
    return json.dumps(normalize_dfql(value), separators=(",", ":"), sort_keys=True)
