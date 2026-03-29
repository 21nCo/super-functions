from typing import Any, Dict, Callable, Optional, Union
from .envelope import DatafnError
from .handlers.query import handle_query
from .handlers.mutation import handle_mutation
from .handlers.transact import handle_transact
from .handlers.sync import handle_seed, handle_clone, handle_pull, handle_push
from .validation import validate_schema
from .logger import create_logger


class DatafnServerConfig:
    def __init__(self, schema: Any = None, db: Any = None, authorize: Any = None,
                 plugins: Any = None, logger: Any = None, limits: Any = None, **kwargs):
        if kwargs:
            unknown = ", ".join(sorted(kwargs))
            raise TypeError(f"Unexpected config key(s): {unknown}")
        self.schema = schema
        self.db = db
        self.authorize = authorize
        self.plugins = [] if plugins is None else plugins
        self.logger = create_logger(logger)
        self.limits = limits


def _validate_config(config_obj: 'DatafnServerConfig') -> None:
    """Validate config parameters at server initialization. Raises ValueError on invalid config."""
    if config_obj.schema is None:
        raise ValueError("schema is required")
    if not isinstance(config_obj.schema, dict):
        raise ValueError("schema must be a dict")

    if config_obj.db is None:
        raise ValueError("db is required")

    if config_obj.authorize is not None and not callable(config_obj.authorize):
        raise ValueError("authorize must be callable")

    if config_obj.limits is not None:
        if not isinstance(config_obj.limits, dict):
            raise ValueError("limits must be a dict")
        for key, val in config_obj.limits.items():
            if not isinstance(val, (int, float)):
                raise ValueError(f"limits.{key} must be numeric, got {type(val).__name__}")
            if val < 0:
                raise ValueError(f"limits.{key} must be non-negative, got {val}")


def create_datafn_server(config: Any) -> Dict[str, Any]:
    # Normalize config
    if isinstance(config, DatafnServerConfig):
        config_obj = config
    elif isinstance(config, dict):
        config_obj = DatafnServerConfig(**config)
    else:
        config_obj = DatafnServerConfig(**vars(config))

    # Validate config parameters
    _validate_config(config_obj)

    # Validate schema at init
    validation_result = validate_schema(config_obj.schema)
    if not validation_result["ok"]:
        raise DatafnError(
            code=validation_result["error"]["code"],
            message=validation_result["error"]["message"],
            details=validation_result["error"].get("details", {})
        )

    # Log server initialization
    config_obj.logger.info("DataFn server initialized")

    async def query_wrapper(ctx: Any, payload: Any) -> Union[Dict[str, Any], Any]:
        return await handle_query(ctx, payload, config_obj)

    async def mutation_wrapper(ctx: Any, payload: Any) -> Union[Dict[str, Any], Any]:
        return await handle_mutation(ctx, payload, config_obj)

    async def transact_wrapper(ctx: Any, payload: Any) -> Dict[str, Any]:
        return await handle_transact(ctx, payload, config_obj)

    async def seed_wrapper(ctx: Any, payload: Any) -> Dict[str, Any]:
        return await handle_seed(ctx, payload, config_obj)

    async def clone_wrapper(ctx: Any, payload: Any) -> Dict[str, Any]:
        return await handle_clone(ctx, payload, config_obj)

    async def pull_wrapper(ctx: Any, payload: Any) -> Dict[str, Any]:
        return await handle_pull(ctx, payload, config_obj)

    async def push_wrapper(ctx: Any, payload: Any) -> Dict[str, Any]:
        return await handle_push(ctx, payload, config_obj)

    return {
        "routes": {
            "POST /datafn/query": query_wrapper,
            "POST /datafn/mutation": mutation_wrapper,
            "POST /datafn/transact": transact_wrapper,
            "POST /datafn/seed": seed_wrapper,
            "POST /datafn/clone": clone_wrapper,
            "POST /datafn/pull": pull_wrapper,
            "POST /datafn/push": push_wrapper,
        }
    }
