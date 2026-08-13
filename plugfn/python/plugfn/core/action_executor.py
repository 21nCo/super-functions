"""Action executor for executing provider actions with middleware."""

import asyncio
import copy
import json
import time
from collections import OrderedDict, deque
from datetime import datetime
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple


class RateLimitExceededError(RuntimeError):
    """Raised when an action exceeds its configured provider quota."""


class InMemoryRateLimiter:
    """Atomic sliding-window limiter shared by an action executor instance."""

    def __init__(self, now: Callable[[], float] = time.monotonic) -> None:
        self._buckets: Dict[str, Deque[float]] = {}
        self._windows: Dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._now = now

    async def acquire(self, keys: List[str], requests: int, window_ms: int) -> None:
        if requests <= 0 or window_ms <= 0:
            raise ValueError("rate limit requests and window must be positive")

        now = self._now()
        window_seconds = window_ms / 1000
        async with self._lock:
            for key, bucket in list(self._buckets.items()):
                cutoff = now - self._windows.get(key, window_seconds)
                while bucket and bucket[0] <= cutoff:
                    bucket.popleft()
                if not bucket:
                    self._buckets.pop(key, None)
                    self._windows.pop(key, None)

            buckets = [self._buckets.setdefault(key, deque()) for key in keys]
            for key in keys:
                self._windows[key] = window_seconds
            if any(len(bucket) >= requests for bucket in buckets):
                raise RateLimitExceededError("provider action rate limit exceeded")
            for bucket in buckets:
                bucket.append(now)


class ActionExecutor:
    """Executes provider actions with retry, rate limiting, and caching."""

    def __init__(
        self,
        connection_manager: Any,
        provider_registry: Any,
        logger: Any,
        enable_retry: bool = True,
        enable_rate_limit: bool = True,
        enable_cache: bool = True,
        retry_options: Optional[Dict[str, Any]] = None,
    ):
        """Initialize action executor.

        Args:
            connection_manager: Connection manager
            provider_registry: Provider registry
            logger: Logger instance
            enable_retry: Enable retry middleware
            enable_rate_limit: Enable rate limiting
            enable_cache: Enable caching
        """
        self.connection_manager = connection_manager
        self.provider_registry = provider_registry
        self.logger = logger
        self.enable_retry = enable_retry
        self.enable_rate_limit = enable_rate_limit
        self.enable_cache = enable_cache
        self.retry_options = retry_options or {}
        self._rate_limiter = InMemoryRateLimiter()
        self._cache: "OrderedDict[str, Any]" = OrderedDict()
        self._cache_lock = asyncio.Lock()
        self._max_cache_entries = 1000

        # Store action logs for metrics
        self._action_logs: List[Dict[str, Any]] = []

    async def execute(
        self,
        provider: str,
        action: str,
        user_id: str,
        params: Dict[str, Any],
        connection_id: Optional[str] = None,
        retry: Optional[Dict[str, Any]] = None,
        timeout: Optional[int] = None,
        cache: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Execute a provider action.

        Args:
            provider: Provider name
            action: Action name
            user_id: User ID
            params: Action parameters
            connection_id: Optional specific connection ID
            retry: Optional retry configuration
            timeout: Optional timeout in seconds
            cache: Optional cache flag

        Returns:
            Action result dict with success, data, error, etc.

        Raises:
            ValueError: If provider or action not found
        """
        start_time = time.time()
        retries = 0

        # Get provider
        provider_obj = self.provider_registry.get_provider(provider)
        if not provider_obj:
            raise ValueError(f"Provider {provider} not found")

        # Get action
        if not hasattr(provider_obj, "actions") or action not in provider_obj.actions:
            raise ValueError(f"Action {action} not found in provider {provider}")

        action_obj = provider_obj.actions[action]

        # Get or select connection
        if connection_id:
            connection = await self.connection_manager.get_connection(connection_id)
            if connection.user_id != user_id:
                raise ValueError("Connection does not belong to user")
            if connection.provider != provider:
                raise ValueError("Connection provider does not match requested provider")
        else:
            # Find active connection for this provider and user
            connections = await self.connection_manager.list_connections(
                user_id, provider
            )
            active_connections = [c for c in connections if c.status == "active"]

            if not active_connections:
                raise ValueError(
                    f"No active connection found for provider {provider} and user {user_id}"
                )

            connection = active_connections[0]

        cache_key = None
        if self.enable_cache and cache is True:
            cache_key = self._cache_key(
                provider, action, user_id, connection.id, params
            )
            cache_hit, cached_data = await self._cache_get(cache_key)
            if cache_hit:
                duration = int((time.time() - start_time) * 1000)
                result = {
                    "success": True,
                    "data": cached_data,
                    "error": None,
                    "provider": provider,
                    "action": action,
                    "cached": True,
                    "duration": duration,
                    "retries": 0,
                    "timestamp": datetime.now(),
                }
                self._log_action(result, user_id, connection.id)
                return result

        # Update last used
        await self.connection_manager.update_last_used(connection.id)

        # Get credentials
        credentials = await self.connection_manager.get_credentials(connection.id)

        try:
            if self.enable_rate_limit and provider_obj.rate_limit:
                await self._rate_limiter.acquire(
                    [f"provider:{provider}", f"provider:{provider}:user:{user_id}"],
                    provider_obj.rate_limit["requests"],
                    provider_obj.rate_limit["window"],
                )

            # Execute action (with retry if enabled)
            retry_config = {**self.retry_options, **(retry or {})}
            max_attempts = 1
            if self.enable_retry:
                max_attempts = max(1, int(retry_config.get("max_attempts", 3)))

            last_error = None
            for attempt in range(max_attempts):
                try:
                    # Create action context
                    from ..http.http_client import HttpClient

                    http_client = HttpClient(
                        base_url=provider_obj.base_url,
                        credentials=credentials,
                        auth_type=provider_obj.auth_type,
                        logger=self.logger,
                        timeout=timeout if timeout is not None else 30,
                    )

                    context = ActionContext(
                        user_id=user_id,
                        connection_id=connection.id,
                        provider_name=provider,
                        provider_base_url=provider_obj.base_url,
                        auth_type=provider_obj.auth_type,
                        credentials=credentials,
                        http=http_client,
                        logger=self.logger,
                    )

                    # Execute the action
                    result_data = await action_obj.execute(params, context)

                    # Success!
                    duration = int((time.time() - start_time) * 1000)

                    result = {
                        "success": True,
                        "data": result_data,
                        "error": None,
                        "provider": provider,
                        "action": action,
                        "cached": False,
                        "duration": duration,
                        "retries": retries,
                        "timestamp": datetime.now(),
                    }

                    if cache_key:
                        await self._cache_set(cache_key, result_data)

                    # Log action
                    self._log_action(result, user_id, connection.id)

                    return result

                except Exception as e:
                    last_error = e
                    retries += 1

                    if attempt < max_attempts - 1:
                        # Wait before retry
                        delay = retry_config.get("delay", 1000)
                        backoff = retry_config.get("backoff", "exponential")

                        if backoff == "exponential":
                            wait_time = (delay / 1000) * (2 ** attempt)
                        else:
                            wait_time = delay / 1000

                        self.logger.warn(
                            f"Action failed, retrying in {wait_time}s",
                            {
                                "provider": provider,
                                "action": action,
                                "attempt": attempt + 1,
                                "error": str(e),
                            },
                        )

                        await asyncio.sleep(wait_time)

            # All retries exhausted
            duration = int((time.time() - start_time) * 1000)

            result = {
                "success": False,
                "data": None,
                "error": last_error,
                "provider": provider,
                "action": action,
                "cached": False,
                "duration": duration,
                "retries": retries,
                "timestamp": datetime.now(),
            }

            # Log action
            self._log_action(result, user_id, connection.id)

            return result

        except Exception as e:
            duration = int((time.time() - start_time) * 1000)

            result = {
                "success": False,
                "data": None,
                "error": e,
                "provider": provider,
                "action": action,
                "cached": False,
                "duration": duration,
                "retries": retries,
                "timestamp": datetime.now(),
            }

            # Log action
            self._log_action(result, user_id, connection.id)

            return result

    @staticmethod
    def _cache_key(
        provider: str,
        action: str,
        user_id: str,
        connection_id: str,
        params: Dict[str, Any],
    ) -> str:
        encoded_params = json.dumps(
            params, sort_keys=True, separators=(",", ":"), default=str
        )
        return f"{provider}:{action}:{user_id}:{connection_id}:{encoded_params}"

    async def _cache_get(self, key: str) -> Tuple[bool, Any]:
        async with self._cache_lock:
            if key not in self._cache:
                return False, None
            value = self._cache.pop(key)
            self._cache[key] = value
            return True, copy.deepcopy(value)

    async def _cache_set(self, key: str, value: Any) -> None:
        async with self._cache_lock:
            self._cache.pop(key, None)
            self._cache[key] = copy.deepcopy(value)
            while len(self._cache) > self._max_cache_entries:
                self._cache.popitem(last=False)

    async def batch(self, actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Execute multiple actions in batch.

        Args:
            actions: List of action definitions

        Returns:
            List of action results
        """
        tasks = [
            self.execute(
                provider=action["provider"],
                action=action["action"],
                user_id=action["user_id"],
                params=action["params"],
                connection_id=action.get("connection_id"),
            )
            for action in actions
        ]

        return await asyncio.gather(*tasks, return_exceptions=False)

    async def get_metrics(
        self, time_range: Optional[str] = None, **filters: Any
    ) -> Dict[str, Any]:
        """Get metrics about action executions.

        Args:
            time_range: Time range filter
            **filters: Additional filters

        Returns:
            Metrics data
        """
        # Filter logs based on criteria
        logs = self._action_logs

        if time_range:
            # Apply time filter (simplified)
            # In production, this would query from database
            logs = list(logs)

        if filters.get("provider"):
            logs = [log for log in logs if log.get("provider") == filters["provider"]]

        if filters.get("user_id"):
            logs = [log for log in logs if log.get("user_id") == filters["user_id"]]

        # Calculate metrics
        total = len(logs)
        successful = len([log for log in logs if log.get("success")])
        failed = total - successful

        avg_duration = 0
        if logs:
            avg_duration = sum(log.get("duration", 0) for log in logs) / len(logs)

        return {
            "total_requests": total,
            "successful_requests": successful,
            "failed_requests": failed,
            "success_rate": successful / total if total > 0 else 0,
            "avg_response_time": avg_duration,
        }

    def _log_action(
        self, result: Dict[str, Any], user_id: str, connection_id: str
    ) -> None:
        """Log an action execution.

        Args:
            result: Action result
            user_id: User ID
            connection_id: Connection ID
        """
        log_entry = {
            **result,
            "user_id": user_id,
            "connection_id": connection_id,
        }

        # Store in memory (in production, this would go to database)
        self._action_logs.append(log_entry)

        # Keep only last 10000 logs in memory
        if len(self._action_logs) > 10000:
            self._action_logs = self._action_logs[-10000:]


class ActionContext:
    """Context provided to action executors."""

    def __init__(
        self,
        user_id: str,
        connection_id: str,
        provider_name: str,
        provider_base_url: str,
        auth_type: str,
        credentials: Dict[str, Any],
        http: Any,
        logger: Any,
    ):
        """Initialize action context.

        Args:
            user_id: User ID
            connection_id: Connection ID
            provider_name: Provider name
            provider_base_url: Provider base URL
            auth_type: Authentication type
            credentials: Decrypted credentials
            http: HTTP client
            logger: Logger instance
        """
        self.user_id = user_id
        self.connection_id = connection_id
        self.provider = {
            "name": provider_name,
            "base_url": provider_base_url,
        }
        self.auth = {
            "type": auth_type,
            "credentials": credentials,
        }
        self.http = http
        self.logger = logger
