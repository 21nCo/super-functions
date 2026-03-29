import json
from typing import Any, Dict, List, Optional, Set
from .envelope import DatafnError
from .validation import SchemaIndex

GLOBAL_PERMISSIONS_TABLE = "__datafn_permissions_global"
PRINCIPAL_MEMBERSHIPS_TABLE = "__datafn_principal_memberships"
PRINCIPAL_HIERARCHY_TABLE = "__datafn_principal_hierarchy"

_LEVEL_RANK = {"viewer": 1, "editor": 2, "owner": 3}


def normalize_non_empty_string(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def canonicalize_principal_from_user_id(user_id: str) -> str:
    return user_id if ":" in user_id else f"user:{user_id}"


def canonicalize_actor_principal(actor_id: str) -> str:
    normalized = normalize_non_empty_string(actor_id)
    if not normalized:
        return "user:"
    return canonicalize_principal_from_user_id(normalized)


def get_actor_id_from_context(ctx: Any) -> Optional[str]:
    if not isinstance(ctx, dict):
        return None
    actor = (
        ctx.get("actorId")
        or ctx.get("actor_id")
        or ctx.get("userId")
        or ctx.get("user_id")
    )
    return normalize_non_empty_string(actor)


def get_shareable_capability(resource_def: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    capabilities = resource_def.get("capabilities", [])
    if not isinstance(capabilities, list):
        return None
    for capability in capabilities:
        if isinstance(capability, dict) and isinstance(capability.get("shareable"), dict):
            return capability["shareable"]
    return None


def is_private_shareable_resource(resource_def: Dict[str, Any]) -> bool:
    shareable = get_shareable_capability(resource_def)
    if not shareable:
        return False
    return shareable.get("default") == "private"


def is_grant_active(row: Dict[str, Any]) -> bool:
    return row.get("revokedAt") is None


async def resolve_effective_principals(
    db: Any,
    namespace: str,
    actor_id: str,
) -> List[str]:
    actor_principal = canonicalize_actor_principal(actor_id)
    effective: Set[str] = {actor_id, actor_principal}

    # Direct memberships
    for actor_candidate in {actor_id, actor_principal}:
        try:
            rows = await db.find_many(
                PRINCIPAL_MEMBERSHIPS_TABLE,
                where=[{"field": "actorId", "operator": "eq", "value": actor_candidate}],
                namespace=namespace,
            )
        except Exception:
            rows = []
        for row in rows:
            principal_id = normalize_non_empty_string(row.get("principalId"))
            if principal_id and is_grant_active(row):
                effective.add(principal_id)

    # Hierarchy expansion (best-effort; absent tables are tolerated)
    frontier = list(effective)
    visited: Set[str] = set()
    max_depth = 16
    depth = 0

    while frontier and depth < max_depth:
        depth += 1
        next_frontier: List[str] = []
        for principal_id in frontier:
            if principal_id in visited:
                continue
            visited.add(principal_id)
            try:
                parent_rows = await db.find_many(
                    PRINCIPAL_HIERARCHY_TABLE,
                    where=[{"field": "principalId", "operator": "eq", "value": principal_id}],
                    namespace=namespace,
                )
            except Exception:
                parent_rows = []
            for row in parent_rows:
                parent = normalize_non_empty_string(row.get("parentPrincipalId"))
                if not parent or not is_grant_active(row):
                    continue
                if parent not in effective:
                    effective.add(parent)
                    next_frontier.append(parent)
        frontier = next_frontier

    return sorted(effective)


async def resolve_access_level(
    db: Any,
    schema_index: SchemaIndex,
    resource_name: str,
    record_id: str,
    actor_id: Optional[str],
    namespace: str = "datafn",
) -> Optional[str]:
    if not actor_id:
        return None

    resource_def = schema_index.resources_by_name.get(resource_name)
    if not resource_def:
        return None

    if not is_private_shareable_resource(resource_def):
        return "owner"

    record = await db.find_one(
        resource_name,
        [{"field": "id", "operator": "eq", "value": record_id}],
        namespace=namespace,
    )
    if not record:
        return None

    actor_principal = canonicalize_actor_principal(actor_id)
    created_by = normalize_non_empty_string(record.get("createdBy"))
    if created_by and (
        created_by == actor_id
        or canonicalize_principal_from_user_id(created_by) == actor_principal
    ):
        return "owner"

    principals = await resolve_effective_principals(db, namespace, actor_id)
    best_level: Optional[str] = None
    for principal_id in principals:
        rows = await db.find_many(
            GLOBAL_PERMISSIONS_TABLE,
            where=[
                {"field": "resourceType", "operator": "eq", "value": resource_name},
                {"field": "resourceNs", "operator": "eq", "value": namespace},
                {"field": "principalId", "operator": "eq", "value": principal_id},
            ],
            namespace=namespace,
        )
        for row in rows:
            if not is_grant_active(row):
                continue
            level = row.get("level")
            if level not in _LEVEL_RANK:
                continue
            grant_resource_id = row.get("resourceId")
            if grant_resource_id is not None and grant_resource_id != record_id:
                continue
            if best_level is None or _LEVEL_RANK[level] > _LEVEL_RANK[best_level]:
                best_level = level

    return best_level


async def is_record_visible(
    db: Any,
    schema_index: SchemaIndex,
    resource_name: str,
    record: Dict[str, Any],
    actor_id: Optional[str],
    namespace: str = "datafn",
) -> bool:
    resource_def = schema_index.resources_by_name.get(resource_name)
    if not resource_def:
        return False
    if not is_private_shareable_resource(resource_def):
        return True
    if not actor_id:
        return False
    record_id = normalize_non_empty_string(record.get("id"))
    if not record_id:
        return False
    level = await resolve_access_level(
        db,
        schema_index,
        resource_name,
        record_id,
        actor_id,
        namespace=namespace,
    )
    return level is not None


def validate_query_authz(
    query: Dict[str, Any],
    resource_name: str,
    index: SchemaIndex,
    allow_unknown_resources: bool = False,
) -> Optional[DatafnError]:
    """
    Validate field-level read authorization on a query.
    If the resource has permissions.read.fields defined, only those fields are readable.
    `id` is always readable.
    """
    resource_def = index.resources_by_name.get(resource_name)
    if not resource_def:
        return None

    permissions = resource_def.get("permissions")
    if not permissions:
        if is_private_shareable_resource(resource_def) and not allow_unknown_resources:
            return DatafnError(
                code="FORBIDDEN",
                message="Access denied: resource requires explicit permissions",
                details={"path": "python.authz"},
            )
        return None

    read_perms = permissions.get("read")
    if not read_perms:
        return None

    allowed_fields = read_perms.get("fields")
    if not allowed_fields:
        return None

    allowed_set: Set[str] = set(allowed_fields)
    allowed_set.add("id")  # id is always readable

    # Check select fields
    select = query.get("select", [])
    for field in select:
        base = field.split(".")[0]
        if base not in allowed_set:
            return DatafnError(
                code="FORBIDDEN",
                message=f"Access denied for field '{base}' on resource '{resource_name}'",
                details={"path": "select"}
            )

    # Check filter fields
    filters = query.get("filters", {})
    err = _check_filter_fields(filters, allowed_set, resource_name)
    if err:
        return err

    # Check sort fields
    sort = query.get("sort", [])
    for term in sort:
        if isinstance(term, str):
            field = term.lstrip("-").split(":")[0]
            if field not in allowed_set:
                return DatafnError(
                    code="FORBIDDEN",
                    message=f"Access denied for field '{field}' on resource '{resource_name}'",
                    details={"path": "sort"}
                )

    return None


def _check_filter_fields(
    filters: Any,
    allowed_set: Set[str],
    resource_name: str,
) -> Optional[DatafnError]:
    """Recursively check that filter fields are allowed."""
    if not isinstance(filters, dict):
        return None

    for key, value in filters.items():
        if key in ("$and", "$or"):
            if isinstance(value, list):
                for item in value:
                    err = _check_filter_fields(item, allowed_set, resource_name)
                    if err:
                        return err
        elif not key.startswith("$"):
            base = key.split(".")[0]
            if base not in allowed_set:
                return DatafnError(
                    code="FORBIDDEN",
                    message=f"Access denied for field '{base}' on resource '{resource_name}'",
                    details={"path": "filters"}
                )
    return None


def validate_mutation_authz(
    mutation: Dict[str, Any],
    resource_name: str,
    index: SchemaIndex,
    allow_unknown_resources: bool = False,
) -> Optional[DatafnError]:
    """
    Validate field-level write authorization on a mutation.
    If the resource has permissions.write.fields defined, only those fields are writable.
    """
    resource_def = index.resources_by_name.get(resource_name)
    if not resource_def:
        return None

    permissions = resource_def.get("permissions")
    if not permissions:
        if is_private_shareable_resource(resource_def) and not allow_unknown_resources:
            return DatafnError(
                code="FORBIDDEN",
                message="Access denied: resource requires explicit permissions",
                details={"path": "python.authz"},
            )
        return None

    write_perms = permissions.get("write")
    if not write_perms:
        return None

    allowed_fields = write_perms.get("fields")
    if not allowed_fields:
        return None

    allowed_set: Set[str] = set(allowed_fields)

    # Check single record
    record = mutation.get("record", {})
    if record:
        for key in record.keys():
            if key not in allowed_set:
                return DatafnError(
                    code="FORBIDDEN",
                    message=f"Access denied for field '{key}' on resource '{resource_name}'",
                    details={"path": "record"}
                )

    # Check batch records
    records = mutation.get("records", [])
    if records:
        for i, rec in enumerate(records):
            if isinstance(rec, dict):
                for key in rec.keys():
                    if key not in allowed_set:
                        return DatafnError(
                            code="FORBIDDEN",
                            message=f"Access denied for field '{key}' on resource '{resource_name}'",
                            details={"path": f"records[{i}]"}
                        )

    return None


def check_payload_size(body: Any, max_bytes: int) -> Optional[DatafnError]:
    """
    Check if payload body exceeds max_bytes.
    body can be bytes, str, or have a length.
    Returns DatafnError if exceeded, None otherwise.
    """
    if max_bytes <= 0:
        return None

    size = 0
    if isinstance(body, bytes):
        size = len(body)
    elif isinstance(body, str):
        size = len(body.encode("utf-8"))
    elif hasattr(body, "__len__"):
        try:
            size = len(json.dumps(body).encode("utf-8"))
        except TypeError:
            size = len(repr(body).encode("utf-8"))
    else:
        return None

    if size > max_bytes:
        return DatafnError(
            code="LIMIT_EXCEEDED",
            message=f"Payload size ({size} bytes) exceeds maximum of {max_bytes} bytes",
            details={"path": "$"}
        )
    return None
