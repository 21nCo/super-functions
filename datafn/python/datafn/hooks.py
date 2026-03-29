from typing import Any, Dict, List, Optional

def _normalize_runs_on(plugin: Any) -> List[str]:
    runs_on = getattr(plugin, "runs_on", [])
    if isinstance(runs_on, list):
        return runs_on
    if isinstance(runs_on, tuple):
        return list(runs_on)
    return []

async def run_before_hook(
    plugins: List[Any],
    env: str,
    hook_name: str,
    ctx: Any,
    payload: Any,
    logger: Any = None,
) -> Dict[str, Any]:
    current = payload
    for plugin in plugins:
        runs_on = _normalize_runs_on(plugin)
        if env not in runs_on:
            continue

        hook_fn = getattr(plugin, hook_name, None)
        if hook_fn is None:
            continue

        try:
            result = await hook_fn(ctx, current)
            if result is not None:
                current = result
        except Exception as e:
            plugin_name = getattr(plugin, "name", "unknown")
            if logger:
                logger.error(
                    f"Plugin '{plugin_name}' {hook_name} failed",
                    {"plugin": plugin_name, "hook": hook_name, "error": str(e)},
                )
            return {
                "ok": False,
                "error": {
                    "code": "PLUGIN_ERROR",
                    "message": f"Plugin '{plugin_name}' {hook_name} failed",
                    "details": {"plugin": plugin_name, "hook": hook_name},
                },
            }

    return {"ok": True, "value": current}


async def run_after_hook(
    plugins: List[Any],
    env: str,
    hook_name: str,
    ctx: Any,
    payload: Any,
    result: Any,
    logger: Any = None,
) -> Any:
    current_result = result
    for plugin in plugins:
        runs_on = _normalize_runs_on(plugin)
        if env not in runs_on:
            continue

        hook_fn = getattr(plugin, hook_name, None)
        if hook_fn is None:
            continue

        try:
            transformed = await hook_fn(ctx, payload, current_result)
            if transformed is not None:
                current_result = transformed
        except Exception as e:
            if logger:
                logger.error(
                    f"Plugin '{getattr(plugin, 'name', 'unknown')}' {hook_name} failed: {e}",
                    {"plugin": getattr(plugin, "name", "unknown"), "hook": hook_name},
                )

    return current_result
