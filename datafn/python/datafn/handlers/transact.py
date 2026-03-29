from typing import Any, Dict, List
from ..envelope import ok_response, error_response, DatafnError
from ..transaction import with_transaction
from ..db import Adapter
from .query import handle_query
from .mutation import handle_mutation

DEFAULT_MAX_STEPS = 100


async def handle_transact(ctx: Any, payload: Any, config: Any) -> Dict[str, Any]:
    logger = getattr(config, "logger", None)
    try:
        if logger:
            logger.debug("Transact request", {"atomic": payload.get("atomic", True) if isinstance(payload, dict) else None})
        if not isinstance(payload, dict):
            return error_response({
                "code": "DFQL_INVALID",
                "message": "Invalid JSON",
                "details": {"path": "$"}
            })

        if config.authorize:
            if not await config.authorize(ctx, "transact", payload):
                return error_response({
                    "code": "FORBIDDEN",
                    "message": "Authorization denied",
                    "details": {"path": "$"}
                })

        steps = payload.get("steps")
        if not isinstance(steps, list):
            return error_response({
                "code": "DFQL_INVALID",
                "message": "Missing steps array",
                "details": {"path": "steps"}
            })

        limits = getattr(config, "limits", {}) or {}
        max_steps = limits.get("maxTransactSteps", DEFAULT_MAX_STEPS)

        if len(steps) > max_steps:
            return error_response({
                "code": "LIMIT_EXCEEDED",
                "message": "Transaction exceeds maximum steps",
                "details": {"path": "steps", "max": max_steps}
            })

        atomic = payload.get("atomic", True)

        if atomic:
            return await _execute_atomic(config, steps, ctx)
        else:
            return await _execute_non_atomic(config, steps, ctx)

    except Exception as e:
        if logger:
            logger.error("Transact failed", {"code": "INTERNAL", "message": str(e)})
        return error_response({
            "code": "INTERNAL",
            "message": str(e),
            "details": {}
        })


async def _execute_atomic(config: Any, steps: List[Dict[str, Any]], ctx: Any) -> Dict[str, Any]:
    """Execute all steps atomically. On error, roll back and annotate prior results."""

    # Shared mutable state for capturing results inside the transaction callback
    captured_results: List[Dict[str, Any]] = []
    captured_step_types: List[str] = []  # "query" or "mutation"
    failed_error = None

    async def run_in_tx(tx_db: Adapter) -> List[Any]:
        tx_config = _TxConfig(config, tx_db)
        for step in steps:
            step_type = "query" if "query" in step else "mutation"
            res = await _execute_single_step(tx_db, tx_config, step, ctx)
            captured_step_types.append(step_type)

            if not res.get("ok"):
                # Capture the error and prior results, then raise to trigger rollback
                captured_results.append(res)
                err_data = res.get("error", {})
                raise DatafnError(
                    code=err_data.get("code", "INTERNAL"),
                    message=err_data.get("message", "Unknown error"),
                    details=err_data.get("details")
                )

            captured_results.append(res)

        return [_unwrap_envelope_result(r) for r in captured_results]

    try:
        results = await with_transaction(config.db, run_in_tx)
        return ok_response({"ok": True, "results": results})
    except DatafnError as e:
        # Transaction rolled back. Annotate prior successful mutation results.
        annotated = []
        for i, res in enumerate(captured_results):
            unwrapped = _unwrap_envelope_result(res)
            if res.get("ok") and captured_step_types[i] == "mutation":
                # Mutation result — mark as rolled back
                if isinstance(unwrapped, dict):
                    unwrapped["rolledBack"] = True
            annotated.append(unwrapped)

        # If the last captured result is the error itself, it's already in annotated.
        # If not (error was raised before appending), add error entry.
        last_is_error = captured_results and not captured_results[-1].get("ok")
        if not last_is_error:
            annotated.append({"ok": False, "error": {"code": e.code, "message": e.message, "details": e.details}})

        return ok_response({"ok": False, "results": annotated})
    except Exception as e:
        return error_response({
            "code": "INTERNAL",
            "message": str(e),
            "details": {}
        })


async def _execute_non_atomic(config: Any, steps: List[Dict[str, Any]], ctx: Any) -> Dict[str, Any]:
    """Execute steps independently. On error, record it and continue."""
    step_results = []
    overall_ok = True

    for step in steps:
        try:
            res = await _execute_single_step(config.db, config, step, ctx)
            step_results.append(_unwrap_envelope_result(res))

            if not res.get("ok"):
                overall_ok = False
        except Exception as e:
            overall_ok = False
            step_results.append({
                "ok": False,
                "error": {"code": "INTERNAL", "message": str(e)}
            })

    return ok_response({
        "ok": overall_ok,
        "results": step_results
    })


class _TxConfig:
    """Config wrapper that substitutes the transaction-bound adapter."""
    def __init__(self, original: Any, tx_db: Adapter):
        self.schema = original.schema
        self.db = tx_db
        self.authorize = original.authorize
        self.limits = getattr(original, "limits", {}) or {}
        self.plugins = getattr(original, "plugins", []) or []
        self.logger = getattr(original, "logger", None)
        self.allowUnknownResources = getattr(original, "allowUnknownResources", False)


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
    if envelope.get("ok"):
        return envelope.get("result")
    else:
        return envelope
