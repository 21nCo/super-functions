from typing import Any, Dict, List, Optional


def parse_select_token(token: str) -> Dict[str, Any]:
    parts = token.split(".")
    directive = None
    if len(parts) > 1 and parts[-1] == "*":
        directive = "*"
    return {
        "path": parts,
        "base_name": parts[0],
        "directive": directive,
    }


def apply_select(records: List[Dict[str, Any]], select_tokens: List[str]) -> List[Dict[str, Any]]:
    parsed = [parse_select_token(t) for t in select_tokens]
    allowed = {"id"}  # id always included
    for p in parsed:
        allowed.add(p["base_name"])

    result = []
    for record in records:
        filtered = {k: v for k, v in record.items() if k in allowed}
        result.append(filtered)
    return result


def apply_omit(records: List[Dict[str, Any]], omit_tokens: List[str]) -> List[Dict[str, Any]]:
    parsed = [parse_select_token(t) for t in omit_tokens]
    excluded = set()
    for p in parsed:
        excluded.add(p["base_name"])
    excluded.discard("id")  # id is always kept

    result = []
    for record in records:
        filtered = {k: v for k, v in record.items() if k not in excluded}
        result.append(filtered)
    return result
