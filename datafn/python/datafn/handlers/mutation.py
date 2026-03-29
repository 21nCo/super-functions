import time
import traceback
from typing import Any, Dict, List, Optional, Tuple, Union
from ..envelope import ok_response, error_response, DatafnError, classify_error
from ..validation import (
    SchemaIndex, validate_resource, validate_record_keys, validate_relation,
    validate_fields, validate_record_types, validate_required_fields,
    apply_defaults, validate_mutation_limits, validate_id_length,
)
from ..utils.validate_fields import check_prototype_pollution
from ..idempotency import check_idempotency, store_idempotency
from ..guards import evaluate_guard
from ..relations import execute_relate, execute_modify_relation, execute_unrelate
from ..hooks import run_before_hook, run_after_hook
from ..change_tracking import write_change
from ..authz import (
    canonicalize_principal_from_user_id,
    get_actor_id_from_context,
    get_shareable_capability,
    is_private_shareable_resource,
    resolve_access_level,
    validate_mutation_authz,
)

RESERVED_FIELDS = {"id", "createdAt", "createdBy", "updatedAt", "updatedBy", "version"}
GLOBAL_PERMISSIONS_TABLE = "__datafn_permissions_global"


def _get_namespace(ctx: Any) -> str:
    if isinstance(ctx, dict):
        namespace = ctx.get("namespace")
        if isinstance(namespace, str) and namespace.strip():
            return namespace
    return "datafn"


def _normalize_non_empty_string(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _principal_in_namespace(principal_id: str, namespace: str) -> bool:
    return principal_id == namespace or principal_id.startswith(f"{namespace}:")


def _permission_entry_id(
    resource: str,
    namespace: str,
    resource_id: Optional[str],
    principal_id: str,
) -> str:
    return f"{resource}:{namespace}:{resource_id if resource_id is not None else '*'}:{principal_id}"


def _apply_audit_fields_on_insert(record: Dict[str, Any], actor_id: Optional[str]) -> Dict[str, Any]:
    if not actor_id:
        return record
    if "createdBy" not in record:
        record["createdBy"] = actor_id
    if "updatedBy" not in record:
        record["updatedBy"] = actor_id
    return record


def _resolve_share_scope(payload: Dict[str, Any]) -> str:
    scope = payload.get("scope", "record")
    if scope not in ("record", "resource"):
        raise DatafnError(
            code="DFQL_SHARE_SCOPE_INVALID",
            message="scope must be either record or resource",
            details={"path": "scope"},
        )
    if scope == "resource" and payload.get("id") is not None:
        raise DatafnError(
            code="DFQL_SHARE_SCOPE_INVALID",
            message="resource scope share must omit id",
            details={"path": "id"},
        )
    return scope


def _canonicalize_share_principal(share_with: Any) -> str:
    if not isinstance(share_with, dict):
        raise DatafnError(
            code="DFQL_INVALID",
            message="Invalid DFQL: shareWith must be object",
            details={"path": "shareWith"},
        )

    principal_id = _normalize_non_empty_string(share_with.get("principalId"))
    user_id = _normalize_non_empty_string(share_with.get("userId"))

    if share_with.get("principalId") is not None and principal_id is None:
        raise DatafnError(
            code="DFQL_PRINCIPAL_INVALID",
            message="principalId must be non-empty string",
            details={"path": "shareWith.principalId"},
        )
    if share_with.get("userId") is not None and user_id is None:
        raise DatafnError(
            code="DFQL_PRINCIPAL_INVALID",
            message="userId must be non-empty string",
            details={"path": "shareWith.userId"},
        )
    if principal_id and user_id:
        canonical_user = canonicalize_principal_from_user_id(user_id)
        if canonical_user != principal_id:
            raise DatafnError(
                code="DFQL_PRINCIPAL_INVALID",
                message="Provide only one of shareWith.userId or shareWith.principalId",
                details={"path": "shareWith"},
            )
    if not principal_id and not user_id:
        raise DatafnError(
            code="DFQL_PRINCIPAL_INVALID",
            message="Either shareWith.userId or shareWith.principalId is required",
            details={"path": "shareWith"},
        )
    return principal_id or canonicalize_principal_from_user_id(user_id)  # type: ignore[arg-type]


async def _enforce_private_shareable_mutation_access(
    db: Any,
    index: SchemaIndex,
    resource: str,
    operation: str,
    record_id: Optional[str],
    actor_id: Optional[str],
    namespace: str,
    share_scope: Optional[str] = None,
    logger: Any = None,
) -> None:
    resource_def = index.resources_by_name.get(resource)
    if not resource_def or not is_private_shareable_resource(resource_def):
        return

    if operation == "insert":
        if actor_id:
            return
        raise DatafnError(
            code="FORBIDDEN",
            message="Authorization denied",
            details={"path": "operation"},
        )

    if operation not in {"merge", "replace", "delete", "share", "unshare"}:
        return

    if (
        operation in {"merge", "replace", "delete", "share", "unshare"}
        and not record_id
        and not (operation in {"share", "unshare"} and share_scope == "resource")
    ):
        # Let operation-specific validation return deterministic missing-id errors.
        return

    # Scope-level share/unshare requires actor but no record ownership lookup.
    if operation in {"share", "unshare"} and share_scope == "resource":
        if actor_id:
            return
        raise DatafnError(
            code="FORBIDDEN",
            message="Authorization denied",
            details={"path": "operation"},
        )

    if not record_id or not actor_id:
        if operation in {"share", "unshare"} and logger:
            logger.warn("Unauthorized share access", {
                "resource": resource,
                "recordId": record_id,
                "actorId": actor_id,
                "operation": operation,
            })
        raise DatafnError(
            code="FORBIDDEN",
            message="Authorization denied",
            details={"path": "operation"},
        )

    level = await resolve_access_level(
        db,
        index,
        resource,
        record_id,
        actor_id,
        namespace=namespace,
    )
    if operation in {"delete", "share", "unshare"}:
        allowed = level == "owner"
    else:
        allowed = level in {"owner", "editor"}

    if not allowed:
        if operation in {"share", "unshare"} and logger:
            logger.warn("Unauthorized share access", {
                "resource": resource,
                "recordId": record_id,
                "actorId": actor_id,
                "operation": operation,
            })
        raise DatafnError(
            code="FORBIDDEN",
            message="Authorization denied",
            details={"path": "operation"},
        )


async def _execute_share(
    db: Any,
    index: SchemaIndex,
    payload: Dict[str, Any],
    namespace: str,
    actor_id: Optional[str],
) -> Tuple[List[str], List[Dict[str, Any]]]:
    resource = payload["resource"]
    resource_def = index.resources_by_name[resource]
    shareable = get_shareable_capability(resource_def)
    if not shareable:
        raise DatafnError(
            code="DFQL_UNSUPPORTED",
            message="Unsupported DFQL feature: mutation.operation.share",
            details={"path": "operation"},
        )

    scope = _resolve_share_scope(payload)
    record_id = payload.get("id") if scope == "record" else None
    if scope == "record" and not isinstance(record_id, str):
        raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})

    principal_id = _canonicalize_share_principal(payload.get("shareWith"))
    if shareable.get("crossNsShareable") is False and not _principal_in_namespace(principal_id, namespace):
        raise DatafnError(
            code="DFQL_CROSS_NS_SHARE_FORBIDDEN",
            message="Cross-namespace sharing is disabled for this resource",
            details={"path": "shareWith.principalId"},
        )

    level = payload.get("shareWith", {}).get("level", "viewer")
    allowed_levels = shareable.get("levels", ["viewer", "editor", "owner"])
    if not isinstance(level, str) or level not in allowed_levels:
        raise DatafnError(
            code="DFQL_INVALID",
            message=f"Invalid DFQL: shareWith.level must be one of [{', '.join(allowed_levels)}]",
            details={"path": "shareWith.level"},
        )

    permission_id = _permission_entry_id(resource, namespace, record_id, principal_id)
    now = int(time.time() * 1000)
    permission_record = {
        "id": permission_id,
        "resourceType": resource,
        "resourceNs": namespace,
        "resourceId": record_id,
        "principalId": principal_id,
        "level": level,
        "grantKind": "scope" if scope == "resource" else "record",
        "sourceRef": None,
        "grantedBy": actor_id or "system",
        "grantedAt": now,
        "revokedAt": None,
    }
    existing = await db.find_one(
        GLOBAL_PERMISSIONS_TABLE,
        [{"field": "id", "operator": "eq", "value": permission_id}],
        namespace=namespace,
    )
    if existing:
        await db.update(
            GLOBAL_PERMISSIONS_TABLE,
            [{"field": "id", "operator": "eq", "value": permission_id}],
            permission_record,
            namespace=namespace,
        )
    else:
        await db.create(GLOBAL_PERMISSIONS_TABLE, permission_record, namespace=namespace)

    return (
        [permission_id],
        [{"table": GLOBAL_PERMISSIONS_TABLE, "operation": "upsert", "recordId": permission_id}],
    )


async def _execute_unshare(
    db: Any,
    index: SchemaIndex,
    payload: Dict[str, Any],
    namespace: str,
    actor_id: Optional[str],
) -> Tuple[List[str], List[Dict[str, Any]]]:
    resource = payload["resource"]
    resource_def = index.resources_by_name[resource]
    shareable = get_shareable_capability(resource_def)
    if not shareable:
        raise DatafnError(
            code="DFQL_UNSUPPORTED",
            message="Unsupported DFQL feature: mutation.operation.unshare",
            details={"path": "operation"},
        )

    scope = _resolve_share_scope(payload)
    record_id = payload.get("id") if scope == "record" else None
    if scope == "record" and not isinstance(record_id, str):
        raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})

    principal_id = _canonicalize_share_principal(payload.get("shareWith"))
    permission_id = _permission_entry_id(resource, namespace, record_id, principal_id)

    existing = await db.find_one(
        GLOBAL_PERMISSIONS_TABLE,
        [{"field": "id", "operator": "eq", "value": permission_id}],
        namespace=namespace,
    )
    if not existing:
        return [], []

    await db.delete(
        GLOBAL_PERMISSIONS_TABLE,
        [{"field": "id", "operator": "eq", "value": permission_id}],
        namespace=namespace,
    )
    return (
        [permission_id],
        [{"table": GLOBAL_PERMISSIONS_TABLE, "operation": "delete", "recordId": permission_id}],
    )


async def handle_mutation(ctx: Any, payload: Any, config: Any) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    if isinstance(payload, list):
        results = []
        for p in payload:
            results.append(await _handle_single_mutation(ctx, p, config))
        return results

    return await _handle_single_mutation(ctx, payload, config)


async def _handle_single_mutation(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    logger = getattr(config, "logger", None)
    plugins = getattr(config, "plugins", []) or []
    namespace = _get_namespace(ctx)
    actor_id = get_actor_id_from_context(ctx)

    try:
        if not isinstance(payload, dict):
            return error_response({
                "code": "DFQL_INVALID",
                "message": "Invalid JSON",
                "details": {"path": "$"}
            })

        resource = payload.get("resource")
        if logger:
            logger.debug("Mutation request", {"resource": resource, "operation": payload.get("operation")})

        # Run before_mutation hooks
        if plugins:
            hook_result = await run_before_hook(plugins, "server", "before_mutation", ctx, payload, logger=logger)
            if not hook_result.get("ok"):
                if logger:
                    logger.error("Mutation rejected by plugin", {"error": hook_result.get("error", {}).get("message", "")})
                return hook_result
            payload = hook_result.get("value", payload)

        # Authorize
        if config.authorize:
            try:
                allowed = await config.authorize(ctx, "mutation", payload)
                if not allowed:
                    if logger:
                        logger.error("Mutation authorization denied", {"resource": resource})
                    return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})
            except Exception:
                if logger:
                    logger.error("Mutation authorization denied", {"resource": resource})
                return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})

        # Idempotency Check
        client_id = payload.get("clientId")
        mutation_id = payload.get("mutationId")

        if client_id and mutation_id:
            cached = await check_idempotency(
                config.db,
                namespace,
                client_id,
                mutation_id,
                logger=logger,
            )
            if cached:
                cached_result = dict(cached)
                cached_result["deduped"] = True
                return ok_response(cached_result)

        # Core Execution
        index = SchemaIndex(config.schema)
        limits = getattr(config, "limits", {}) or {}

        # Field-level authorization
        resource = payload.get("resource")
        if resource:
            authz_err = validate_mutation_authz(
                payload,
                resource,
                index,
                allow_unknown_resources=getattr(config, "allowUnknownResources", False),
            )
            if authz_err:
                if logger:
                    logger.error("Mutation field authorization denied", {"code": authz_err.code, "message": authz_err.message})
                return authz_err.to_envelope()

        affected_ids, changes = await execute_mutation_core(
            config.db,
            index,
            payload,
            limits,
            namespace=namespace,
            actor_id=actor_id,
            logger=logger,
        )

        result = {
            "ok": True,
            "mutationId": mutation_id,
            "affectedIds": affected_ids,
            "deduped": False,
            "errors": []
        }

        # Write change tracking
        if changes:
            for change in changes:
                try:
                    await _write_change(config.db, change, namespace)
                except Exception as e:
                    if logger:
                        logger.warn(
                            "Change tracking failed",
                            {"namespace": namespace, "change": change, "error": str(e)},
                        )

        # Store Idempotency
        if client_id and mutation_id:
            await store_idempotency(config.db, namespace, client_id, mutation_id, result)

        response = ok_response(result)

        # Run after_mutation hooks
        if plugins:
            response = await run_after_hook(
                plugins,
                "server",
                "after_mutation",
                ctx,
                payload,
                response,
                logger=logger,
            )

        if logger:
            logger.debug("Mutation completed", {"resource": resource})

        return response

    except DatafnError as e:
        if logger:
            logger.error("Mutation failed", {"code": e.code, "message": e.message})
        return e.to_envelope()
    except Exception as e:
        if logger:
            logger.error(
                "Mutation failed",
                {
                    "code": "INTERNAL",
                    "message": str(e),
                    "traceback": traceback.format_exc(),
                },
            )
        return error_response({
            "code": "INTERNAL",
            "message": "Internal server error",
            "details": {}
        })


async def _write_change(db: Any, change: Dict[str, Any], namespace: str) -> None:
    await write_change(
        db,
        namespace=namespace,
        table=change["table"],
        operation=change["operation"],
        record_id=change["recordId"],
    )


async def execute_mutation_core(
    db: Any,
    index: SchemaIndex,
    payload: Dict[str, Any],
    limits: Optional[Dict[str, Any]] = None,
    namespace: str = "datafn",
    actor_id: Optional[str] = None,
    logger: Any = None,
) -> tuple:
    """
    Executes a single mutation payload.
    Returns (affected_ids, changes) tuple.
    """
    limits = limits or {}
    resource = payload.get("resource")
    operation = payload.get("operation")
    record_id = payload.get("id")

    if not resource:
        raise DatafnError(code="DFQL_INVALID", message="Missing resource", details={"path": "resource"})

    err = validate_resource(index, resource, "resource")
    if err:
        raise err

    # ID length validation
    max_id_length = limits.get("maxIdLength", 255)
    id_err = validate_id_length(record_id, max_id_length)
    if id_err:
        raise id_err

    await _enforce_private_shareable_mutation_access(
        db,
        index,
        resource,
        operation,
        record_id if isinstance(record_id, str) else None,
        actor_id,
        namespace,
        share_scope=payload.get("scope") if operation in {"share", "unshare"} else None,
        logger=logger,
    )

    # Batch insert via records[]
    records_list = payload.get("records")
    if records_list is not None:
        if not isinstance(records_list, list):
            raise DatafnError(code="DFQL_INVALID", message="records must be an array", details={"path": "records"})

        # Batch size limit
        batch_err = validate_mutation_limits(payload, limits)
        if batch_err:
            raise batch_err

        affected_ids = []
        changes = []
        for i, rec in enumerate(records_list):
            if not isinstance(rec, dict):
                raise DatafnError(
                    code="DFQL_INVALID",
                    message="Record must be an object",
                    details={"path": f"records[{i}]"},
                )
            # Prototype pollution check
            poisoned = check_prototype_pollution(rec)
            if poisoned:
                raise DatafnError(code="DFQL_INVALID", message=f"Prototype pollution detected: {poisoned}", details={"path": f"records[{i}]"})

            # ID length check per record
            rec_id = rec.get("id")
            id_err = validate_id_length(rec_id, max_id_length)
            if id_err:
                raise id_err

            # Field validation
            err = validate_record_keys(index, resource, rec, f"records[{i}]")
            if err:
                raise err

            type_errors = validate_record_types(rec, resource, index)
            if type_errors:
                raise DatafnError(code="DFQL_INVALID", message=type_errors[0], details={"path": f"records[{i}]"})

            # Required fields + defaults for insert
            missing = validate_required_fields(rec, resource, index)
            if missing:
                raise DatafnError(code="DFQL_INVALID", message=f"Required field '{missing[0]}' missing", details={"path": f"records[{i}]"})

            rec = apply_defaults(rec, resource, index)
            rec = _apply_audit_fields_on_insert(rec, actor_id)

            try:
                await db.create(resource, rec, namespace=namespace)
            except Exception as e:
                code = classify_error(e)
                raise DatafnError(code=code, message=str(e), details={"path": f"records[{i}]"})

            rid = rec.get("id")
            if rid:
                affected_ids.append(rid)
                changes.append({"table": resource, "operation": "insert", "recordId": rid})

        return affected_ids, changes

    # Single record path
    record = payload.get("record", {})
    if not isinstance(record, dict):
        raise DatafnError(
            code="DFQL_INVALID",
            message="Record must be an object",
            details={"path": "record"},
        )

    # Prototype pollution check
    poisoned = check_prototype_pollution(record)
    if poisoned:
        raise DatafnError(code="DFQL_INVALID", message=f"Prototype pollution detected: {poisoned}", details={"path": "record"})

    # Guard Evaluation
    guard = payload.get("if")

    if guard:
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Guard requires id", details={"path": "id"})

        # When adapter supports transactions, wrap guard+mutation atomically
        if hasattr(db, "transaction"):
            async with db.transaction() as tx_db:
                match = await evaluate_guard(
                    tx_db,
                    resource,
                    record_id,
                    guard,
                    namespace=namespace,
                    tx_db=tx_db,
                )
                if not match:
                    raise DatafnError(code="CONFLICT", message="Guard condition not met", details={"path": "if"})
                # Execute mutation within the same transaction, guard already passed
                payload_no_guard = {k: v for k, v in payload.items() if k != "if"}
                return await execute_mutation_core(
                    tx_db,
                    index,
                    payload_no_guard,
                    limits,
                    namespace=namespace,
                    actor_id=actor_id,
                    logger=logger,
                )
        else:
            # No transaction support — sequential with TOCTOU risk
            match = await evaluate_guard(
                db,
                resource,
                record_id,
                guard,
                namespace=namespace,
            )
            if not match:
                raise DatafnError(code="CONFLICT", message="Guard condition not met", details={"path": "if"})

    affected_ids = []
    changes = []

    if operation == "insert":
        err = validate_record_keys(index, resource, record, "record")
        if err:
            raise err

        type_errors = validate_record_types(record, resource, index)
        if type_errors:
            raise DatafnError(code="DFQL_INVALID", message=type_errors[0], details={"path": "record"})

        # Required fields + defaults
        missing = validate_required_fields(record, resource, index)
        if missing:
            raise DatafnError(code="DFQL_INVALID", message=f"Required field '{missing[0]}' missing", details={"path": "record"})

        record = apply_defaults(record, resource, index)
        record = _apply_audit_fields_on_insert(record, actor_id)

        if "id" not in record and record_id:
            record["id"] = record_id

        try:
            await db.create(resource, record, namespace=namespace)
        except Exception as e:
            code = classify_error(e)
            raise DatafnError(code=code, message=str(e), details={"path": "record"})

        rid = record.get("id")
        if rid:
            affected_ids.append(rid)
            changes.append({"table": resource, "operation": "insert", "recordId": rid})

    elif operation == "merge":
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})

        err = validate_record_keys(index, resource, record, "record")
        if err:
            raise err

        type_errors = validate_record_types(record, resource, index)
        if type_errors:
            raise DatafnError(code="DFQL_INVALID", message=type_errors[0], details={"path": "record"})

        # Merge decision: check existence
        existing = await db.find_one(
            resource,
            [{"field": "id", "operator": "eq", "value": record_id}],
            namespace=namespace,
        )

        if existing:
            # Update path — partial merge, no required field check
            try:
                await db.update(
                    resource,
                    [{"field": "id", "operator": "eq", "value": record_id}],
                    record,
                    namespace=namespace,
                )
            except Exception as e:
                code = classify_error(e)
                raise DatafnError(code=code, message=str(e), details={"path": "record"})
            changes.append({"table": resource, "operation": "update", "recordId": record_id})
        else:
            # Insert path — validate required fields, apply defaults
            missing = validate_required_fields(record, resource, index)
            if missing:
                raise DatafnError(code="DFQL_INVALID", message=f"Required field '{missing[0]}' missing", details={"path": "record"})

            record = apply_defaults(record, resource, index)
            record = _apply_audit_fields_on_insert(record, actor_id)
            record["id"] = record_id

            try:
                await db.create(resource, record, namespace=namespace)
            except Exception as e:
                code = classify_error(e)
                raise DatafnError(code=code, message=str(e), details={"path": "record"})
            changes.append({"table": resource, "operation": "insert", "recordId": record_id})

        affected_ids.append(record_id)

    elif operation == "replace":
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})

        # Fetch existing to preserve system fields
        existing = await db.find_one(
            resource,
            [{"field": "id", "operator": "eq", "value": record_id}],
            namespace=namespace,
        )

        # Build replacement record: all schema fields set to null or default
        all_writable = index.writable_fields_by_resource.get(resource, set())
        defaults = index.field_defaults.get(resource, {})

        replace_record = {}
        for f in all_writable:
            if f in RESERVED_FIELDS:
                continue
            replace_record[f] = defaults.get(f, None)

        # Apply incoming record (strip readonly/system fields from input)
        readonly = index.readonly_fields.get(resource, set())
        for key, value in record.items():
            if key in readonly or key in RESERVED_FIELDS:
                continue
            replace_record[key] = value

        if existing:
            for field in ("createdAt", "createdBy", "version"):
                if field in existing:
                    replace_record[field] = existing[field]

        # Type validation on the final replacement
        type_errors = validate_record_types(replace_record, resource, index)
        if type_errors:
            raise DatafnError(code="DFQL_INVALID", message=type_errors[0], details={"path": "record"})

        try:
            await db.update(
                resource,
                [{"field": "id", "operator": "eq", "value": record_id}],
                replace_record,
                namespace=namespace,
            )
        except Exception as e:
            code = classify_error(e)
            raise DatafnError(code=code, message=str(e), details={"path": "record"})

        affected_ids.append(record_id)
        changes.append({"table": resource, "operation": "update", "recordId": record_id})

    elif operation == "delete":
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})

        # Idempotent delete: check existence first
        existing = await db.find_one(
            resource,
            [{"field": "id", "operator": "eq", "value": record_id}],
            namespace=namespace,
        )
        if existing:
            try:
                await db.delete(
                    resource,
                    [{"field": "id", "operator": "eq", "value": record_id}],
                    namespace=namespace,
                )
            except Exception as e:
                code = classify_error(e)
                raise DatafnError(code=code, message=str(e), details={"path": "id"})
            affected_ids.append(record_id)
            changes.append({"table": resource, "operation": "delete", "recordId": record_id})
        # If not exists: return empty affectedIds, no change tracking

    elif operation == "share":
        share_affected, share_changes = await _execute_share(
            db,
            index,
            payload,
            namespace=namespace,
            actor_id=actor_id,
        )
        affected_ids.extend(share_affected)
        changes.extend(share_changes)
        share_scope = _resolve_share_scope(payload)
        if share_scope == "record" and isinstance(record_id, str):
            changes.append({"table": resource, "operation": "upsert", "recordId": record_id, "reason": "grant_backfill"})
        elif share_scope == "resource":
            scope_rows = await db.find_many(resource, where=[], namespace=namespace)
            for row in scope_rows:
                row_id = row.get("id")
                if isinstance(row_id, str):
                    changes.append({"table": resource, "operation": "upsert", "recordId": row_id, "reason": "grant_backfill"})

    elif operation == "unshare":
        unshare_affected, unshare_changes = await _execute_unshare(
            db,
            index,
            payload,
            namespace=namespace,
            actor_id=actor_id,
        )
        affected_ids.extend(unshare_affected)
        changes.extend(unshare_changes)
        unshare_scope = _resolve_share_scope(payload)
        if unshare_scope == "record" and isinstance(record_id, str):
            changes.append({"table": resource, "operation": "delete", "recordId": record_id, "reason": "revoked"})
        elif unshare_scope == "resource":
            scope_rows = await db.find_many(resource, where=[], namespace=namespace)
            for row in scope_rows:
                row_id = row.get("id")
                if isinstance(row_id, str):
                    changes.append({"table": resource, "operation": "delete", "recordId": row_id, "reason": "revoked"})

    elif operation == "relate":
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        await execute_relate(db, index, payload, namespace=namespace)
        affected_ids.append(record_id)

    elif operation == "modifyRelation":
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        await execute_modify_relation(db, index, payload, namespace=namespace)
        affected_ids.append(record_id)

    elif operation == "unrelate":
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        await execute_unrelate(db, index, payload, namespace=namespace)
        affected_ids.append(record_id)

    else:
        raise DatafnError(code="DFQL_INVALID", message=f"Unknown operation: {operation}", details={"path": "operation"})

    return affected_ids, changes
