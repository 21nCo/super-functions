from typing import Any, Optional
from datetime import datetime


POISON_KEYS = {"__proto__", "constructor", "prototype"}


def check_prototype_pollution(obj: Any, path: str = "$") -> Optional[str]:
    if isinstance(obj, dict):
        for key in obj:
            if key in POISON_KEYS:
                return key
            nested = check_prototype_pollution(obj[key], f"{path}.{key}")
            if nested is not None:
                return nested
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            nested = check_prototype_pollution(item, f"{path}[{i}]")
            if nested is not None:
                return nested
    return None


def validate_field_value(schema_type: str, value: Any, nullable: bool = False) -> bool:
    if value is None:
        return nullable

    type_checks = {
        "string": lambda v: isinstance(v, str),
        "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        "boolean": lambda v: isinstance(v, bool),
        "date": lambda v: isinstance(v, (int, float, str, datetime)) and not isinstance(v, bool),
        "object": lambda v: isinstance(v, dict),
        "array": lambda v: isinstance(v, list),
        "file": lambda v: isinstance(v, (str, dict)),
        "json": lambda _v: True,
    }

    checker = type_checks.get(schema_type)
    if checker is None:
        return True  # Unknown types pass (forward compat)
    return checker(value)
