from typing import Any, Dict, List, Optional
from ..envelope import ok_response, error_response, DatafnError
from ..transaction import with_transaction
from ..db import Adapter
from .query import handle_query
from .mutation import handle_mutation

# Config limit (hardcoded default for now or passed in config?)
# Spec says: config.limits.maxTransactSteps (default 100)
DEFAULT_MAX_STEPS = 100

async def handle_transact(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    try:
        # 1. Parse JSON body
        if not isinstance(payload, dict):
             return error_response({
                "code": "DFQL_INVALID",
                "message": "Invalid JSON",
                "details": {"path": "$"}
            })

        # 2. Authorize
        if config.authorize:
             if not await config.authorize(ctx, "transact", payload):
                return error_response({
                    "code": "FORBIDDEN",
                    "message": "Authorization denied",
                    "details": {"path": "$"}
                })

        # 3. Validate Payload
        steps = payload.get("steps")
        if not isinstance(steps, list):
             return error_response({
                "code": "DFQL_INVALID",
                "message": "Missing steps array",
                "details": {"path": "steps"}
            })

        # Check limit
        limits = getattr(config, "limits", {})
        max_steps = limits.get("maxTransactSteps", DEFAULT_MAX_STEPS)
        
        if len(steps) > max_steps:
             return error_response({
                "code": "LIMIT_EXCEEDED",
                "message": "Transaction exceeds maximum steps",
                "details": {"path": "steps", "max": max_steps}
            })

        atomic = payload.get("atomic", True)
        
        # 4. Execute
        if atomic:
            # Wrap in transaction
            try:
                results = await with_transaction(config.db, lambda tx_db: _execute_steps(tx_db, config, steps, ctx))
                return ok_response({"ok": True, "results": results})
            except DatafnError as e:
                # If step failed, it raised DatafnError (or we caught it inside and re-raised)
                # If atomic, the whole thing fails. 
                # TS behavior: "Transaction result returns ok: false with error from failed step"
                return e.to_envelope()
            except Exception as e:
                return error_response({
                    "code": "INTERNAL",
                    "message": str(e),
                    "details": {}
                })
        else:
            # Non-atomic
            # We must catch errors per step and continue? 
            # Or stop? 
            # TS spec: "atomic: false applies mutations in order without rollback (partial commit)"
            # "Subsequent steps after failure are not executed" (Wait, TX-ATOMIC-001 says this for atomic=true failure)
            # Actually TV-TX-ATOMIC-PARTIAL-001 shows: result.ok=false, results=[{ok:true}, {ok:false}]
            # So for atomic=false, we return a result with ok=False if any step failed, but we include individual results.
            
            step_results = []
            overall_ok = True
            
            # We use base config.db (non-transactional or implicit auto-commit)
            for i, step in enumerate(steps):
                try:
                    res = await _execute_single_step(config.db, config, step, ctx)
                    step_results.append(res)
                    # Query steps return {data: ...} or {ok: false...} depending on handle_query?
                    # handle_query returns envelope {ok: true, result: ...}
                    # We need to unwrap envelope?
                    # TS Transact returns "results array" where items are DatafnQueryResult or DatafnMutationResult
                    # Our handlers return Envelopes.
                    
                    if not res.get("ok"):
                        overall_ok = False
                        # Do we stop?
                        # TV-TX-ATOMIC-PARTIAL-001 implies we might stop or continue?
                        # "Subsequent steps after failure are not executed" is listed under TX-ATOMIC-001 which is for atomic=true.
                        # But typically for batch/sequence, we stop on error if dependent.
                        # Let's assume we stop for safety unless "continue on error" is explicit.
                        # TV example shows 2 steps, 2nd failed.
                        break
                        
                except Exception as e:
                    overall_ok = False
                    step_results.append({
                        "ok": False,
                        "error": {"code": "INTERNAL", "message": str(e)}
                    })
                    break
            
            return ok_response({
                "ok": overall_ok,
                "results": [_unwrap_envelope_result(r) for r in step_results]
            })

    except Exception as e:
        return error_response({
            "code": "INTERNAL",
            "message": str(e),
            "details": {}
        })

async def _execute_steps(tx_db: Adapter, config: Any, steps: List[Dict[str, Any]], ctx: Any) -> List[Any]:
    # Create config with tx_db
    # We can clone config?
    # Config is object.
    
    # Quick hack: create new config object or generic wrapper
    class TxConfig:
        def __init__(self, original):
            self.schema = original.schema
            self.db = tx_db
            self.authorize = original.authorize # Auth already done for transact, but handlers might check again?
            # Ideally handlers shouldn't check auth again if we trust internal call?
            # Handlers *do* check auth.
            # But we are calling them internally.
            # We can mock authorize to always return True for internal calls or pass the same ctx.
            # Actually, `authorize` logic might depend on payload.
            # Transact auth covers the batch. Do we need per-step auth?
            # Typically Transact auth grants permission for the transaction scope.
            # But if mutation logic has granular auth (e.g. RLS), we need it.
            # Let's keep original authorize.
            
    tx_config = TxConfig(config)
    
    results = []
    for step in steps:
        res = await _execute_single_step(tx_db, tx_config, step, ctx)
        
        # If any step fails, we MUST raise to trigger rollback in with_transaction
        if not res.get("ok"):
            # Construct error to raise
            err_data = res.get("error", {})
            raise DatafnError(
                code=err_data.get("code", "INTERNAL"),
                message=err_data.get("message", "Unknown error"),
                details=err_data.get("details")
            )
            
        results.append(_unwrap_envelope_result(res))
        
    return results

async def _execute_single_step(db: Adapter, config: Any, step: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    if "query" in step:
        return await handle_query(ctx, step["query"], config)
    elif "mutation" in step:
        return await handle_mutation(ctx, step["mutation"], config)
    else:
        return error_response({
            "code": "DFQL_INVALID",
            "message": "Invalid step: must contain query or mutation",
            "details": {"path": "steps"}
        })

def _unwrap_envelope_result(envelope: Dict[str, Any]) -> Any:
    # Transact response results array contains the inner "result" object for success,
    # or the error object?
    # TS spec: 
    # Query steps return DatafnQueryResult
    # Mutation steps return DatafnMutationResult
    # These are usually the "result" part of the envelope.
    # What about error? "Transaction result returns ok: false with error from failed step" (Top level)
    # But for atomic=false (partial), we need to return list of results which might include errors.
    
    if envelope.get("ok"):
        return envelope.get("result")
    else:
        # If failed, return the envelope (so it has ok: false and error)
        # But we want it in the list of results.
        return envelope
