from typing import Any, Dict, List, Optional, Union
from ..envelope import ok_response, error_response, DatafnError
from ..validation import SchemaIndex, validate_resource, validate_fields

async def handle_query(ctx: Any, payload: Any, config: Any) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    # Handle batch
    if isinstance(payload, list):
        results = []
        for p in payload:
            results.append(await _handle_single_query(ctx, p, config))
        return results # Batch response is list of envelopes? TS server returns array of envelopes.
        
    return await _handle_single_query(ctx, payload, config)

async def _handle_single_query(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    try:
        # 1. Parse JSON body (handled by server/middleware, but payload is passed here)
        if not isinstance(payload, dict):
             return error_response({
                "code": "DFQL_INVALID",
                "message": "Invalid JSON: payload must be an object",
                "details": {"path": "$"}
            })

        # 2. Authorize
        if config.authorize:
            try:
                allowed = await config.authorize(ctx, "query", payload)
                if not allowed:
                    return error_response({
                        "code": "FORBIDDEN",
                        "message": "Authorization denied",
                        "details": {"path": "$"}
                    })
            except Exception as e:
                return error_response({
                        "code": "FORBIDDEN",
                        "message": "Authorization denied",
                        "details": {"path": "$"}
                    })

        # 3. Validate schema
        resource = payload.get("resource")
        if not resource:
             return error_response({
                "code": "DFQL_INVALID",
                "message": "Missing resource",
                "details": {"path": "resource"}
            })

        index = SchemaIndex(config.schema)
        
        # Validate resource
        err = validate_resource(index, resource, "resource")
        if err: return err.to_envelope()
        
        # Validate fields (select)
        select = payload.get("select")
        if select:
            err = validate_fields(index, resource, select, "select")
            if err: return err.to_envelope()
            
        # Validate sort
        sort = payload.get("sort")
        if sort:
            # Sort is ["field:asc", ...]
            sort_fields = [s.split(":")[0] for s in sort]
            err = validate_fields(index, resource, sort_fields, "sort")
            if err: return err.to_envelope()

        # 4. Prepare Adapter Query
        filters = payload.get("filters", {})
        try:
            where = _convert_filters(filters)
        except Exception:
             return error_response({
                "code": "DFQL_INVALID",
                "message": "Invalid filters",
                "details": {"path": "filters"}
            })
        
        limit = payload.get("limit")
        cursor = payload.get("cursor")
        
        # 5. Execute
        data = await config.db.find_many(
            model=resource,
            where=where,
            limit=limit,
            sort=sort,
            cursor=cursor
        )
        
        # 6. Response
        return ok_response({
            "data": data,
            "nextCursor": None # Todo: Implement cursor pagination logic
        })

    except DatafnError as e:
        return e.to_envelope()
    except Exception as e:
        return error_response({
            "code": "INTERNAL",
            "message": str(e),
            "details": {}
        })

def _convert_filters(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    where = []
    for k, v in filters.items():
        if k == "$and":
            if isinstance(v, list):
                for f in v:
                    where.extend(_convert_filters(f))
            continue
            
        if isinstance(v, dict):
            # Operators
            for op, op_val in v.items():
                where.append({"field": k, "operator": op, "value": op_val})
        else:
            where.append({"field": k, "operator": "eq", "value": v})
    return where