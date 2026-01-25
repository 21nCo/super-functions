from typing import Any, Dict, List
from ..envelope import ok_response, error_response, DatafnError
from ..db import Adapter
from ..validation import SchemaIndex
from ..change_tracking import get_changes_since, get_latest_cursor, write_change, get_next_server_seq
from ..idempotency import check_idempotency, store_idempotency
from .mutation import execute_mutation_core

SEED_TABLE = "__datafn_seed"

async def handle_seed(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    try:
        if not isinstance(payload, dict):
            return error_response({"code": "DFQL_INVALID", "message": "Invalid JSON", "details": {"path": "$"}})
            
        client_id = payload.get("clientId")
        if not client_id:
            return error_response({"code": "DFQL_INVALID", "message": "Missing clientId", "details": {"path": "clientId"}})
            
        if config.authorize:
             if not await config.authorize(ctx, "seed", payload):
                return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})
                
        # Check seed idempotency
        # Table: __datafn_seed, id=clientId
        seed_rec = await config.db.find_one(SEED_TABLE, [{"field": "id", "operator": "eq", "value": client_id}])
        
        if not seed_rec:
            # Create seed record
            await config.db.create(SEED_TABLE, {"id": client_id, "timestamp": 0})
            
        return ok_response({"ok": True})
        
    except Exception as e:
        return error_response({"code": "INTERNAL", "message": str(e), "details": {}})

async def handle_clone(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    try:
        if not isinstance(payload, dict):
            return error_response({"code": "DFQL_INVALID", "message": "Invalid JSON", "details": {"path": "$"}})
            
        client_id = payload.get("clientId")
        tables = payload.get("tables", [])
        
        if not client_id:
             return error_response({"code": "DFQL_INVALID", "message": "Missing clientId", "details": {"path": "clientId"}})
             
        if config.authorize:
             if not await config.authorize(ctx, "clone", payload):
                return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})
                
        index = SchemaIndex(config.schema)
        data = {}
        cursors = {}
        
        for table in tables:
            # Check isRemoteOnly
            res_def = index.resources_by_name.get(table)
            if not res_def:
                # Skip or error? Spec doesn't strictly say validation of table existence for clone,
                # but "For each requested table... Check isRemoteOnly".
                # If unknown, assume not remote only? Or error?
                # Best to error if unknown resource requested.
                return error_response({"code": "DFQL_UNKNOWN_RESOURCE", "message": f"Unknown resource: {table}", "details": {"path": "tables"}})
            
            if res_def.get("isRemoteOnly"):
                 return error_response({
                    "code": "DFQL_INVALID", 
                    "message": "Table is remote-only and cannot be cloned", 
                    "details": {"path": "tables", "table": table}
                })
            
            # Query all records
            records = await config.db.find_many(table, [], sort=["id:asc"])
            data[table] = records
            
            # Get latest cursor
            cursor = await get_latest_cursor(config.db, "datafn", table)
            if cursor:
                cursors[table] = cursor
                
        return ok_response({
            "data": data,
            "cursors": cursors
        })

    except Exception as e:
        return error_response({"code": "INTERNAL", "message": str(e), "details": {}})

async def handle_pull(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    try:
        if not isinstance(payload, dict):
            return error_response({"code": "DFQL_INVALID", "message": "Invalid JSON", "details": {"path": "$"}})
            
        client_id = payload.get("clientId")
        cursors = payload.get("cursors", {})
        
        if not client_id:
             return error_response({"code": "DFQL_INVALID", "message": "Missing clientId", "details": {"path": "clientId"}})
             
        if config.authorize:
             if not await config.authorize(ctx, "pull", payload):
                return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})
                
        result_records = {}
        result_deleted = {}
        result_cursors = {}
        
        index = SchemaIndex(config.schema)
        
        # Iterate over all schema resources? Or only requested cursors?
        # Usually pull returns changes for ALL synced tables, assuming client sends cursors for all.
        # Or client sends cursors for what it has.
        # We should iterate over schema resources to ensure we catch new tables?
        # Spec says "For each table". Probably meaning keys in `cursors` OR all resources?
        # Usually pull is global.
        # Let's iterate all resources in schema that are not remote-only.
        
        for res_name, res_def in index.resources_by_name.items():
            if res_def.get("isRemoteOnly"): continue
            
            cursor = cursors.get(res_name)
            # Get changes
            changes_result = await get_changes_since(config.db, "datafn", res_name, cursor)
            changes = changes_result["changes"]
            new_cursor = changes_result["cursor"]
            
            if changes:
                # Separate upserts and deletes
                upserts = []
                deletes = []
                
                # Fetch full records for upserts
                # Optimization: fetch all needed IDs in one go
                upsert_ids = [c["recordId"] for c in changes if c["operation"] != "delete"]
                delete_ids = [c["recordId"] for c in changes if c["operation"] == "delete"]
                
                if upsert_ids:
                    # fetch records
                    # MockAdapter/Adapter might not support "in" operator easily?
                    # Adapter protocol has find_many with where.
                    # Use "id" "in" upsert_ids
                    # If adapter doesn't support IN, we loop.
                    # For now assume IN is supported or loop.
                    # MockAdapter supports simple ops.
                    # Let's loop for safety unless we update Adapter.
                    # Or assume `find_many` with `id` in list works.
                    # Let's just fetch one by one for correctness in MVP.
                    for uid in set(upsert_ids):
                         rec = await config.db.find_one(res_name, [{"field": "id", "operator": "eq", "value": uid}])
                         if rec:
                             upserts.append(rec)
                         else:
                             # Record deleted but change log says upsert?
                             # Maybe deleted later? 
                             # If we process changes in order, we might see insert then delete.
                             # But here we just want latest state.
                             # If record missing, treat as deleted?
                             pass
                
                # Deletes: we just need IDs
                deletes = list(set(delete_ids))
                
                if upserts: result_records[res_name] = upserts
                if deletes: result_deleted[res_name] = deletes
                
            if new_cursor:
                result_cursors[res_name] = new_cursor
                
        return ok_response({
            "records": result_records,
            "deleted": result_deleted,
            "cursors": result_cursors
        })

    except Exception as e:
        return error_response({"code": "INTERNAL", "message": str(e), "details": {}})

async def handle_push(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    try:
        if not isinstance(payload, dict):
            return error_response({"code": "DFQL_INVALID", "message": "Invalid JSON", "details": {"path": "$"}})
            
        client_id = payload.get("clientId")
        mutations = payload.get("mutations", [])
        
        if not client_id:
             return error_response({"code": "DFQL_INVALID", "message": "Missing clientId", "details": {"path": "clientId"}})
             
        if config.authorize:
             if not await config.authorize(ctx, "push", payload):
                return error_response({"code": "FORBIDDEN", "message": "Authorization denied", "details": {"path": "$"}})
                
        applied = []
        errors = []
        index = SchemaIndex(config.schema)
        
        for mutation in mutations:
            m_client_id = mutation.get("clientId")
            m_id = mutation.get("mutationId")
            
            if m_client_id != client_id:
                 errors.append({
                    "mutationId": m_id,
                    "error": {"code": "DFQL_INVALID", "message": "ClientId mismatch"}
                })
                 continue
                 
            # Idempotency
            cached = await check_idempotency(config.db, "datafn", m_client_id, m_id)
            if cached:
                applied.append(m_id)
                continue
                
            try:
                # Execute
                affected_ids = await execute_mutation_core(config.db, index, mutation)
                
                # Change Tracking
                # We need to write changes for affected IDs.
                # execute_mutation_core returns affected_ids.
                # Usually [record_id]
                
                # We need a serverSeq.
                # Ideally we get ONE serverSeq for the batch? Or per mutation?
                # Spec: "Get next serverSeq" "Write change tracking entry"
                # It implies per mutation.
                server_seq = await get_next_server_seq(config.db, "datafn")
                
                for aid in affected_ids:
                    await write_change(
                        config.db, 
                        "datafn", 
                        mutation["resource"], 
                        mutation["operation"], 
                        aid, 
                        server_seq
                    )
                
                # Store idempotency
                result = {
                    "ok": True,
                    "mutationId": m_id,
                    "affectedIds": affected_ids,
                    "deduped": False,
                    "errors": []
                }
                await store_idempotency(config.db, "datafn", m_client_id, m_id, result)
                
                applied.append(m_id)
                
            except DatafnError as e:
                errors.append({
                    "mutationId": m_id,
                    "error": {"code": e.code, "message": e.message, "details": e.details}
                })
            except Exception as e:
                errors.append({
                    "mutationId": m_id,
                    "error": {"code": "INTERNAL", "message": str(e)}
                })

        return ok_response({
            "applied": applied,
            "errors": errors
        })

    except Exception as e:
        return error_response({"code": "INTERNAL", "message": str(e), "details": {}})
