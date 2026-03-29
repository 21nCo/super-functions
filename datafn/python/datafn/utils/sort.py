from typing import Any, Dict, List
import functools


def parse_sort_terms(sort_list: List[str]) -> List[Dict[str, str]]:
    terms = []
    for term in sort_list:
        if term.startswith("-"):
            terms.append({"field": term[1:], "direction": "desc"})
        elif ":" in term:
            field, direction = term.split(":", 1)
            normalized = direction.strip().lower()
            if normalized not in {"asc", "desc"}:
                raise ValueError(f"Invalid sort direction for {field}: {direction}")
            terms.append({"field": field, "direction": normalized})
        else:
            terms.append({"field": term, "direction": "asc"})
    return terms


def sort_records(records: List[Dict[str, Any]], terms: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    if not terms and not records:
        return records

    def compare(a: Dict[str, Any], b: Dict[str, Any]) -> int:
        for term in terms:
            field = term["field"]
            direction = term["direction"]
            va = a.get(field)
            vb = b.get(field)

            # Null handling: nulls sort AFTER non-nulls in asc, BEFORE in desc
            if va is None and vb is None:
                continue
            if va is None:
                return 1 if direction == "asc" else -1
            if vb is None:
                return -1 if direction == "asc" else 1

            if va < vb:
                return -1 if direction == "asc" else 1
            if va > vb:
                return 1 if direction == "asc" else -1

        # Tie-break by id ascending
        id_a = a.get("id", "")
        id_b = b.get("id", "")
        if id_a < id_b:
            return -1
        if id_a > id_b:
            return 1
        return 0

    return sorted(records, key=functools.cmp_to_key(compare))
