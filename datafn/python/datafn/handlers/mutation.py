from typing import Any, Dict, List, Optional, Union
from ..envelope import ok_response, error_response, DatafnError
from ..validation import SchemaIndex, validate_resource, validate_record_keys, validate_relation, validate_fields
from ..idempotency import check_idempotency, store_idempotency
from ..guards import evaluate_guard
from ..relations import execute_relate, execute_modify_relation, execute_unrelate

async def handle_mutation(ctx: Any, payload: Any, config: Any) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    # Handle batch
    if isinstance(payload, list):
        results = []
        for p in payload:
            results.append(await _handle_single_mutation(ctx, p, config))
        return results
        
    return await _handle_single_mutation(ctx, payload, config)

async def _handle_single_mutation(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    try:
        # 1. Parse JSON body (handled)
        if not isinstance(payload, dict):
             return error_response({
                "code": "DFQL_INVALID",
                "message": "Invalid JSON",
                "details": {"path": "$"}
            })

        # 2. Authorize
        if config.authorize:
             if not await config.authorize(ctx, "mutation", payload):
                return error_response({
                    "code": "FORBIDDEN",
                    "message": "Authorization denied",
                    "details": {"path": "$"}
                })

        # 3. Idempotency Check
        client_id = payload.get("clientId")
        mutation_id = payload.get("mutationId")
        
        if client_id and mutation_id:
            cached = await check_idempotency(config.db, "datafn", client_id, mutation_id)
            if cached:
                return ok_response(cached)

        # 4-6. Core Execution (Validation, Guards, DB Ops)
        index = SchemaIndex(config.schema)
        affected_ids = await execute_mutation_core(config.db, index, payload)

        # 7. Result
        result = {
            "ok": True,
            "mutationId": mutation_id,
            "affectedIds": affected_ids,
            "deduped": False,
            "errors": []
        }
        
        # 8. Store Idempotency
        if client_id and mutation_id:
            await store_idempotency(config.db, "datafn", client_id, mutation_id, result)
            
        return ok_response(result)

    except DatafnError as e:
        return e.to_envelope()
    except Exception as e:
        return error_response({
            "code": "INTERNAL",
            "message": str(e),
            "details": {}
        })

async def execute_mutation_core(db: Any, index: SchemaIndex, payload: Dict[str, Any]) -> List[str]:
    """
    Executes a single mutation payload: Validation, Guard, DB Operation.
    Returns affected_ids.
    Raises DatafnError on failure.
    """
    resource = payload.get("resource")
    operation = payload.get("operation")
    
    if not resource: 
        raise DatafnError(code="DFQL_INVALID", message="Missing resource", details={"path": "resource"})
    
    err = validate_resource(index, resource, "resource")
    if err: raise err
    
    # Guard Evaluation
    guard = payload.get("if")
    record_id = payload.get("id") # Required for update/delete/guard
    
    if guard:
        if not record_id:
            raise DatafnError(code="DFQL_INVALID", message="Guard requires id", details={"path": "id"})
            
        match = await evaluate_guard(db, resource, record_id, guard)
        if not match:
            raise DatafnError(code="CONFLICT", message="Guard condition not met", details={"path": "if"})
    
    # Execution
    record = payload.get("record", {})
    affected_ids = []
    
    if operation == "insert":
        # Validate fields
        err = validate_record_keys(index, resource, record, "record")
        if err: raise err
        
        if "id" not in record and "id" in payload:
            record["id"] = payload["id"]
        
        await db.create(resource, record)
        affected_ids.append(record.get("id"))
        
    elif operation == "merge": # Update
        if not record_id: raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        
        err = validate_record_keys(index, resource, record, "record")
        if err: raise err
        
        await db.update(resource, [{"field": "id", "operator": "eq", "value": record_id}], record)
        affected_ids.append(record_id)
        
    elif operation == "replace":
        if not record_id: raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        
        all_fields = index.writable_fields_by_resource[resource]
        replace_record = {f: None for f in all_fields} 
        replace_record.update(record)
        replace_record["id"] = record_id
        
        for sys in ["id", "createdAt", "createdBy", "version"]:
            if sys in replace_record: del replace_record[sys]
        
        await db.update(resource, [{"field": "id", "operator": "eq", "value": record_id}], replace_record)
        affected_ids.append(record_id)
        
    elif operation == "delete":
        if not record_id: raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        
        await db.delete(resource, [{"field": "id", "operator": "eq", "value": record_id}])
        affected_ids.append(record_id)
        
    elif operation == "relate":
        if not record_id: raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        await execute_relate(db, index, payload)
        affected_ids.append(record_id)
        
    elif operation == "modifyRelation":
        if not record_id: raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        await execute_modify_relation(db, index, payload)
        affected_ids.append(record_id)
        
    elif operation == "unrelate":
        if not record_id: raise DatafnError(code="DFQL_INVALID", message="Missing id", details={"path": "id"})
        await execute_unrelate(db, index, payload)
        affected_ids.append(record_id)
        
    else:
         raise DatafnError(code="DFQL_INVALID", message=f"Unknown operation: {operation}", details={"path": "operation"})

    return affected_ids
