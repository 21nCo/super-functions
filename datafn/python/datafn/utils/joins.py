from typing import Any, Dict, List, Optional


def get_join_table_name(from_resource: str, relation_name: str, join_table: Optional[str] = None) -> str:
    if join_table:
        return join_table
    return f"__datafn_join_{from_resource}_{relation_name}"


def get_join_store_key(from_resource: str, relation_name: str, to_resource: str) -> str:
    return f"join_{from_resource}_{relation_name}_{to_resource}"


def enumerate_join_store_keys(
    relations: List[Dict[str, Any]], resource_filter: Optional[str] = None
) -> List[Dict[str, str]]:
    keys = []
    for rel in relations:
        rel_type = rel.get("type", "")
        if rel_type != "many-many":
            continue

        from_res = rel.get("from", "")
        to_res = rel.get("to", "")
        rel_name = rel.get("relation", "")

        if isinstance(from_res, list) or isinstance(to_res, list):
            continue

        if resource_filter and from_res != resource_filter:
            continue

        join_table = rel.get("joinTable")
        keys.append({
            "from": from_res,
            "relation": rel_name,
            "to": to_res,
            "joinTable": get_join_table_name(from_res, rel_name, join_table),
            "storeKey": get_join_store_key(from_res, rel_name, to_res),
        })
    return keys
