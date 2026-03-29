from typing import Any, Dict, List, Optional, Union
from ..envelope import ok_response, error_response, DatafnError
from ..validation import SchemaIndex, validate_resource, validate_fields, validate_query_limits
from ..filters import evaluate_filter, normalize_filter_ops, _evaluate_operator, OP_REMAP
from ..utils.sort import parse_sort_terms, sort_records
from ..utils.select import apply_select, apply_omit
from ..utils.aggregate import calculate_aggregation
from ..hooks import run_before_hook, run_after_hook
from ..authz import (
    get_actor_id_from_context,
    is_private_shareable_resource,
    is_record_visible,
    validate_query_authz,
)


def _get_namespace(ctx: Any) -> str:
    if isinstance(ctx, dict):
        namespace = ctx.get("namespace")
        if isinstance(namespace, str) and namespace.strip():
            return namespace
    return "datafn"


async def handle_query(ctx: Any, payload: Any, config: Any) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    if isinstance(payload, list):
        results = []
        for p in payload:
            results.append(await _handle_single_query(ctx, p, config))
        return results

    return await _handle_single_query(ctx, payload, config)


def _compare_cursor(record: Dict[str, Any], cursor: Dict[str, Any], sort_terms: List[Dict[str, str]], direction: str) -> bool:
    for term in sort_terms:
        field = term["field"]
        sort_dir = term["direction"]
        rv = record.get(field)
        cv = cursor.get(field)

        if rv is None and cv is None:
            continue
        if rv is None:
            return sort_dir == "desc" if direction == "after" else sort_dir == "asc"
        if cv is None:
            return sort_dir == "asc" if direction == "after" else sort_dir == "desc"

        if direction == "after":
            if sort_dir == "asc":
                if rv > cv: return True
                if rv < cv: return False
            else:
                if rv < cv: return True
                if rv > cv: return False
        else:
            if sort_dir == "asc":
                if rv < cv: return True
                if rv > cv: return False
            else:
                if rv > cv: return True
                if rv < cv: return False

    return False


async def _handle_single_query(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    logger = getattr(config, "logger", None)
    plugins = getattr(config, "plugins", []) or []
    namespace = _get_namespace(ctx)
    actor_id = get_actor_id_from_context(ctx)

    try:
        if not isinstance(payload, dict):
            return error_response({
                "code": "DFQL_INVALID",
                "message": "Invalid JSON: payload must be an object",
                "details": {"path": "$"}
            })

        resource = payload.get("resource")
        if logger:
            logger.debug("Query request", {"resource": resource})

        # Run before_query hooks
        if plugins:
            hook_result = await run_before_hook(plugins, "server", "before_query", ctx, payload, logger=logger)
            if not hook_result.get("ok"):
                if logger:
                    logger.error("Query rejected by plugin", {"error": hook_result.get("error", {}).get("message", "")})
                return hook_result
            payload = hook_result.get("value", payload)

        # Authorize
        if config.authorize:
            try:
                allowed = await config.authorize(ctx, "query", payload)
                if not allowed:
                    if logger:
                        logger.error("Query authorization denied", {"resource": resource})
                    return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})
            except Exception:
                if logger:
                    logger.error("Query authorization denied", {"resource": resource})
                return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})

        resource = payload.get("resource")
        if not resource:
            return error_response({"code": "DFQL_INVALID", "message": "Missing resource", "details": {"path": "resource"}})

        index = SchemaIndex(config.schema)

        err = validate_resource(index, resource, "resource")
        if err:
            if logger:
                logger.error("Query failed", {"code": err.code, "message": err.message})
            return err.to_envelope()

        # Field-level authorization
        authz_err = validate_query_authz(payload, resource, index)
        if authz_err:
            if logger:
                logger.error("Query field authorization denied", {"code": authz_err.code, "message": authz_err.message})
            return authz_err.to_envelope()

        # Validate select fields
        select = payload.get("select")
        omit = payload.get("omit")
        if select and omit:
            return error_response({"code": "DFQL_INVALID", "message": "Cannot use both select and omit", "details": {"path": "$"}})

        if select:
            err = validate_fields(index, resource, select, "select")
            if err:
                return err.to_envelope()

        # Limit enforcement
        limits = getattr(config, "limits", {}) or {}
        limit_err = validate_query_limits(payload, limits)
        if limit_err:
            return limit_err.to_envelope()

        # Default sort
        sort_raw = payload.get("sort") or ["id"]
        sort_terms = parse_sort_terms(sort_raw)

        # Cursor validation: id must be final sort field
        cursor = payload.get("cursor")
        if cursor:
            if not sort_terms or sort_terms[-1]["field"] != "id":
                sort_terms.append({"field": "id", "direction": "asc"})

        # Limit clamping
        max_limit = limits.get("maxLimit", 1000)
        req_limit = payload.get("limit")
        if req_limit is None:
            limit = max_limit
        else:
            limit = min(req_limit, max_limit)

        # Fetch all records from adapter
        data = await config.db.find_many(model=resource, where=[], namespace=namespace)

        # In-memory filter
        filters = payload.get("filters", {})
        if filters:
            normalized = normalize_filter_ops(filters)
            data = [r for r in data if evaluate_filter(r, normalized)]

        resource_def = index.resources_by_name.get(resource)
        if resource_def and is_private_shareable_resource(resource_def):
            visible_rows = []
            for row in data:
                if await is_record_visible(
                    config.db,
                    index,
                    resource,
                    row,
                    actor_id,
                    namespace=namespace,
                ):
                    visible_rows.append(row)
            data = visible_rows

        # In-memory sort
        data = sort_records(data, sort_terms)

        # Count (before pagination)
        count_requested = payload.get("count", False)
        total_count = len(data) if count_requested else None

        # Aggregation
        group_by = payload.get("groupBy")
        aggregations = payload.get("aggregations")
        if aggregations:
            result = _handle_aggregation(data, group_by, aggregations, payload.get("having"))
            # Run after_query hooks
            if plugins:
                result = await run_after_hook(plugins, "server", "after_query", ctx, payload, result, logger=logger)
            if logger:
                logger.debug("Query completed", {"resource": resource})
            return result

        # Cursor pagination
        next_cursor = None
        if cursor:
            if "after" in cursor:
                data = [r for r in data if _compare_cursor(r, cursor["after"], sort_terms, "after")]
            elif "before" in cursor:
                data = [r for r in data if _compare_cursor(r, cursor["before"], sort_terms, "before")]
                if len(data) > limit:
                    data = data[-limit:]

        # Offset pagination
        offset = payload.get("offset", 0)
        if offset:
            data = data[offset:]

        # Limit + nextCursor (limit+1 strategy)
        if len(data) > limit:
            data = data[:limit]
            next_cursor = {t["field"]: data[-1].get(t["field"]) for t in sort_terms}
        else:
            data = data[:limit]

        # Select/omit
        if select:
            data = apply_select(data, select)
        elif omit:
            data = apply_omit(data, omit)

        result_data = {"data": data, "nextCursor": next_cursor}
        if count_requested:
            result_data["count"] = total_count

        response = ok_response(result_data)

        # Run after_query hooks
        if plugins:
            response = await run_after_hook(plugins, "server", "after_query", ctx, payload, response, logger=logger)

        if logger:
            logger.debug("Query completed", {"resource": resource})

        return response

    except DatafnError as e:
        if logger:
            logger.error("Query failed", {"code": e.code, "message": e.message})
        return e.to_envelope()
    except Exception as e:
        if logger:
            logger.error("Query failed", {"code": "INTERNAL", "message": str(e)})
        return error_response({"code": "INTERNAL", "message": str(e), "details": {}})


def _handle_aggregation(
    data: List[Dict[str, Any]],
    group_by: Optional[List[str]],
    aggregations: Dict[str, Dict[str, str]],
    having: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if group_by:
        groups: Dict[tuple, List[Dict[str, Any]]] = {}
        for record in data:
            key = tuple(record.get(f) for f in group_by)
            groups.setdefault(key, []).append(record)

        result_data = []
        for key, records in groups.items():
            row = {}
            for i, field in enumerate(group_by):
                row[field] = key[i]

            for agg_name, agg_def in aggregations.items():
                for op, field in agg_def.items():
                    row[agg_name] = calculate_aggregation(op, field, records)

            if having:
                passes = True
                for field, condition in having.items():
                    if isinstance(condition, dict):
                        for op, val in condition.items():
                            actual_op = OP_REMAP.get(op, op) if not op.startswith("$") else op
                            if not _evaluate_operator(row.get(field), actual_op, val):
                                passes = False
                                break
                    else:
                        if row.get(field) != condition:
                            passes = False
                    if not passes:
                        break
                if not passes:
                    continue

            result_data.append(row)

        return ok_response({"data": result_data})
    else:
        row = {}
        for agg_name, agg_def in aggregations.items():
            for op, field in agg_def.items():
                row[agg_name] = calculate_aggregation(op, field, data)
        return ok_response({"data": [row]})
