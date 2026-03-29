from datetime import datetime, timezone
from typing import Any, Dict, List, Union


def to_epoch_ms(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    if isinstance(value, str):
        try:
            # Handle Z suffix for Python < 3.11
            s = value.replace("Z", "+00:00") if value.endswith("Z") else value
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid date value: {value}") from e
    raise ValueError(f"Cannot convert {type(value).__name__} to epoch ms")


def from_epoch_ms(value: Union[int, float, str]) -> datetime:
    if isinstance(value, str):
        try:
            value = int(value)
        except ValueError as e:
            raise ValueError(f"Invalid epoch ms value: {value}") from e
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


def coerce_date_fields_to_epoch(record: Dict[str, Any], date_fields: List[str]) -> None:
    for field in date_fields:
        if field in record and record[field] is not None:
            record[field] = to_epoch_ms(record[field])
