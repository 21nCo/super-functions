from typing import Any, Dict, Callable, Optional, Union
from .envelope import DatafnError
from .handlers.query import handle_query
from .handlers.mutation import handle_mutation
from .handlers.transact import handle_transact
from .handlers.sync import handle_seed, handle_clone, handle_pull, handle_push

class DatafnServerConfig:
    def __init__(self, schema: Any, db: Any = None, authorize: Any = None, limits: Any = None):
        self.schema = schema
        self.db = db
        self.authorize = authorize
        self.limits = limits or {}

def create_datafn_server(config: Any) -> Dict[str, Any]:
    # Normalize config
    if isinstance(config, dict):
        config_obj = DatafnServerConfig(**config)
    else:
        config_obj = config

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