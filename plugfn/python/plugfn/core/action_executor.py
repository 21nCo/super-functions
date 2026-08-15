"""Action executor for executing provider actions with middleware."""

import asyncio
import copy
import heapq
import json
import time
from collections import OrderedDict
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union

import httpx


class RateLimitExceededError(RuntimeError):
    """Raised when an action exceeds its configured provider quota."""


class InMemoryRateLimiter:
    """Atomic sliding-window limiter shared by an action executor instance."""

    def __init__(self, now: Callable[[], float] = time.monotonic) -> None:
        self._buckets: Dict[str, Set[int]] = {}
        self._expiry_heap: List[Tuple[float, int, str]] = []
        self._sequence = 0
        self._lock = asyncio.Lock()
        self._now = now

    async def acquire(self, keys: List[str], requests: int, window_ms: int) -> None:
        if requests <= 0 or window_ms <= 0:
            raise ValueError("rate limit requests and window must be positive")

        now = self._now()
        window_seconds = window_ms / 1000
        async with self._lock:
            self._prune_expired(now)

            buckets = [self._buckets.setdefault(key, set()) for key in keys]
            if any(len(bucket) >= requests for bucket in buckets):
                raise RateLimitExceededError("provider action rate limit exceeded")
            # keys and buckets are built from the same sequence above.
            for key, bucket in zip(keys, buckets):  # noqa: B905
                self._sequence += 1
                bucket.add(self._sequence)
                heapq.heappush(
                    self._expiry_heap,
                    (now + window_seconds, self._sequence, key),
                )

    def _prune_expired(self, now: float) -> None:
        while self._expiry_heap and self._expiry_heap[0][0] <= now:
            _expires_at, sequence, key = heapq.heappop(self._expiry_heap)
            bucket = self._buckets.get(key)
            if not bucket:
                continue
            bucket.discard(sequence)
            if not bucket:
                self._buckets.pop(key, None)


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
        self._cache: "OrderedDict[str, Tuple[Optional[float], Any]]" = OrderedDict()
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
        cache: Optional[Union[bool, Dict[str, Any]]] = None,
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
        cache_options = cache if isinstance(cache, dict) else {}
        cache_requested = cache is True or (
            isinstance(cache, dict) and cache.get("enabled", True) is not False
        )
        configured_ttl = cache_options.get("ttl")
        bypass_cache = (
            isinstance(configured_ttl, (int, float))
            and not isinstance(configured_ttl, bool)
            and configured_ttl <= 0
        )
        if self.enable_cache and cache_requested:
            configured_key = cache_options.get("key")
            cache_key = (
                self._cache_key(
                    provider,
                    action,
                    user_id,
                    connection.id,
                    {"plugfn_custom_cache_key": configured_key},
                )
                if isinstance(configured_key, str) and configured_key
                else self._cache_key(provider, action, user_id, connection.id, params)
            )
            if bypass_cache:
                await self._cache_delete(cache_key)
            else:
                cache_hit, cached_data = await self._cache_get(cache_key)
            if not bypass_cache and cache_hit:
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
            action_is_idempotent = bool(
                retry_config.get("idempotent", getattr(action_obj, "idempotent", False))
            )
            if self.enable_retry and action_is_idempotent:
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

                    if cache_key and not bypass_cache:
                        await self._cache_set(cache_key, result_data, configured_ttl)

                    # Log action
                    self._log_action(result, user_id, connection.id)

                    return result

                except Exception as e:
                    last_error = e
                    retries += 1

                    if attempt < max_attempts - 1 and _is_transient_error(e):
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
                    else:
                        break

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
            expires_at, value = self._cache.pop(key)
            if expires_at is not None and expires_at <= time.monotonic():
                return False, None
            try:
                copied = copy.deepcopy(value)
            except Exception as error:
                self.logger.warn(
                    "Discarding uncopyable action cache entry",
                    {"cache_key": key, "error": str(error)},
                )
                return False, None
            self._cache[key] = (expires_at, value)
            return True, copied

    async def _cache_set(self, key: str, value: Any, ttl_ms: Any = None) -> None:
        expires_at: Optional[float] = None
        if isinstance(ttl_ms, (int, float)) and not isinstance(ttl_ms, bool):
            if ttl_ms <= 0:
                return
            expires_at = time.monotonic() + (ttl_ms / 1000)
        try:
            copied = copy.deepcopy(value)
        except Exception as error:
            self.logger.warn(
                "Skipping uncopyable action cache result",
                {"cache_key": key, "error": str(error)},
            )
            return
        async with self._cache_lock:
            self._cache.pop(key, None)
            self._cache[key] = (expires_at, copied)
            while len(self._cache) > self._max_cache_entries:
                self._cache.popitem(last=False)

    async def _cache_delete(self, key: str) -> None:
        async with self._cache_lock:
            self._cache.pop(key, None)

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


def _is_transient_error(error: Exception) -> bool:
    if isinstance(
        error,
        (
            RateLimitExceededError,
            asyncio.TimeoutError,
            TimeoutError,
            ConnectionError,
            httpx.TimeoutException,
            httpx.NetworkError,
        ),
    ):
        return True

    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    if not isinstance(status, int):
        status = getattr(error, "status_code", getattr(error, "status", None))
    return status in {408, 429, 500, 502, 503, 504}


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
