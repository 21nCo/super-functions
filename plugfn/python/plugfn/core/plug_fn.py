"""Main PlugFn SDK class."""

from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional

from ..types import (
    AuthProvider,
    Connection,
    DatabaseAdapter,
    Provider,
    Workflow,
    WorkflowStatus,
)

if TYPE_CHECKING:
    from ..webhooks.webhook_handler import WebhookHandler
    from .action_executor import ActionExecutor
    from .connection_manager import ConnectionManager
    from .provider_registry import ProviderRegistry
    from .workflow_engine import WorkflowEngine


class PlugFnConfig:
    """Configuration for PlugFn instance."""

    def __init__(
        self,
        database: DatabaseAdapter,
        auth: AuthProvider,
        base_url: str,
        encryption_key: str,
        integrations: Dict[str, Dict[str, Any]],
        logger: Optional[Any] = None,
        retry: Optional[Dict[str, Any]] = None,
        rate_limit: Optional[Dict[str, Any]] = None,
        cache: Optional[Dict[str, Any]] = None,
        webhooks: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Initialize PlugFn configuration.

        Args:
            database: Database adapter for storing connections, workflows, etc.
            auth: Auth provider for authenticating requests
            base_url: Base URL of your application (for OAuth callbacks)
            encryption_key: 32-character encryption key for storing credentials
            integrations: Dict of provider configurations (client_id, client_secret, etc.)
            logger: Optional logger instance
            retry: Optional retry configuration
            rate_limit: Optional rate limit configuration
            cache: Optional cache configuration
            webhooks: Optional webhook configuration
        """
        self.database = database
        self.auth = auth
        self.base_url = base_url
        self.encryption_key = encryption_key
        self.integrations = integrations
        self.logger = logger
        self.retry = retry or {"enabled": True}
        self.rate_limit = rate_limit or {"enabled": True}
        self.cache = cache or {"enabled": True}
        self.webhooks = webhooks or {}


class ConnectionsAPI:
    """API for managing user connections."""

    def __init__(self, manager: "ConnectionManager") -> None:
        self._manager = manager

    async def get_auth_url(
        self,
        provider: str,
        user_id: str,
        redirect_uri: str,
        scopes: Optional[List[str]] = None,
        state: Optional[str] = None,
        connection_name: Optional[str] = None,
    ) -> str:
        """Get OAuth authorization URL.

        Args:
            provider: Provider name (e.g., "github", "slack")
            user_id: User ID to associate with this connection
            redirect_uri: OAuth redirect URI
            scopes: Optional list of scopes to request
            state: Optional state parameter for OAuth
            connection_name: Optional name for this connection

        Returns:
            Authorization URL to redirect user to
        """
        return await self._manager.get_auth_url(
            provider=provider,
            user_id=user_id,
            redirect_uri=redirect_uri,
            scopes=scopes,
            state=state,
            connection_name=connection_name,
        )

    async def handle_callback(
        self, provider: Optional[str], code: str, state: str
    ) -> Connection:
        """Handle OAuth callback and create connection.

        Args:
            provider: Provider name
            code: OAuth authorization code
            state: OAuth state parameter

        Returns:
            Created connection
        """
        return await self._manager.handle_callback(
            provider=provider, code=code, state=state
        )

    async def list(
        self, user_id: str, provider: Optional[str] = None
    ) -> List[Connection]:
        """List connections for a user.

        Args:
            user_id: User ID
            provider: Optional provider filter

        Returns:
            List of connections
        """
        return await self._manager.list_connections(
            user_id=user_id, provider=provider
        )

    async def get(self, connection_id: str) -> Connection:
        """Get a connection by ID.

        Args:
            connection_id: Connection ID

        Returns:
            Connection
        """
        return await self._manager.get_connection(connection_id)

    async def disconnect(self, connection_id: str, user_id: str) -> None:
        """Disconnect and delete a connection.

        Args:
            connection_id: Connection ID
            user_id: User ID (for verification)
        """
        await self._manager.disconnect(
            connection_id=connection_id, user_id=user_id
        )

    async def refresh(self, connection_id: str) -> Connection:
        """Refresh a connection's credentials.

        Args:
            connection_id: Connection ID

        Returns:
            Updated connection
        """
        return await self._manager.refresh_connection(connection_id)


class WorkflowsAPI:
    """API for managing workflows."""

    def __init__(self, engine: "WorkflowEngine") -> None:
        self._engine = engine

    async def list(
        self, user_id: Optional[str] = None, status: Optional[WorkflowStatus] = None
    ) -> List[Workflow]:
        """List workflows.

        Args:
            user_id: Optional user ID filter
            status: Optional status filter

        Returns:
            List of workflows
        """
        return await self._engine.list_workflows(user_id=user_id, status=status)

    async def get(self, workflow_id: str) -> Optional[Workflow]:
        """Get a workflow by ID.

        Args:
            workflow_id: Workflow ID

        Returns:
            Workflow or None if not found
        """
        return await self._engine.get_workflow(workflow_id)

    async def enable(self, workflow_id: str) -> None:
        """Enable a workflow.

        Args:
            workflow_id: Workflow ID
        """
        await self._engine.enable_workflow(workflow_id)

    async def disable(self, workflow_id: str) -> None:
        """Disable a workflow.

        Args:
            workflow_id: Workflow ID
        """
        await self._engine.disable_workflow(workflow_id)

    async def delete(self, workflow_id: str) -> None:
        """Delete a workflow.

        Args:
            workflow_id: Workflow ID
        """
        await self._engine.delete_workflow(workflow_id)

    async def get_stats(self, workflow_id: str) -> Dict[str, Any]:
        """Get workflow execution statistics.

        Args:
            workflow_id: Workflow ID

        Returns:
            Workflow statistics
        """
        return await self._engine.get_workflow_stats(workflow_id)


class WebhooksAPI:
    """API for managing webhooks."""

    def __init__(self, handler: "WebhookHandler") -> None:
        self._handler = handler

    def on(
        self,
        provider: str,
        event: str,
        handler: Optional[Callable[..., Any]] = None,
    ) -> Callable[..., Any]:
        """Register a webhook handler.

        Args:
            provider: Provider name
            event: Event name (e.g., "issues.opened")
            handler: Async function to handle the event
        """
        if handler is None:
            def decorator(callback: Callable[..., Any]) -> Callable[..., Any]:
                self._handler.register_handler(provider, event, callback)
                return callback

            return decorator

        self._handler.register_handler(provider, event, handler)
        return handler

    def off(
        self, provider: str, event: str, handler: Callable[..., Any]
    ) -> None:
        """Unregister a webhook handler.

        Args:
            provider: Provider name
            event: Event name
            handler: Handler function to remove
        """
        self._handler.unregister_handler(provider, event, handler)

    async def handle(
        self,
        provider: str,
        event: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        secret: Optional[str] = None,
    ) -> Any:
        """Handle an incoming webhook.

        Args:
            provider: Provider name
            event: Event name
            payload: Webhook payload
            headers: Request headers
            secret: Optional webhook secret for verification

        Returns:
            Handler result
        """
        return await self._handler.handle_webhook(
            provider=provider,
            event=event,
            payload=payload,
            headers=headers,
            secret=secret,
        )


class ProvidersAPI:
    """API for managing providers."""

    def __init__(self, registry: "ProviderRegistry") -> None:
        self._registry = registry

    def list(self) -> List[Provider]:
        """List all registered providers.

        Returns:
            List of providers
        """
        return self._registry.list_providers()

    def get(self, name: str) -> Optional[Provider]:
        """Get a provider by name.

        Args:
            name: Provider name

        Returns:
            Provider or None if not found
        """
        return self._registry.get_provider(name)

    def register(self, provider: Provider) -> None:
        """Register a new provider.

        Args:
            provider: Provider to register
        """
        self._registry.register_provider(provider)


class PlugFn:
    """Main PlugFn SDK interface.

    Example:
        >>> plug = PlugFn(
        ...     database=adapter,
        ...     auth=auth_provider,
        ...     base_url="https://myapp.com",
        ...     encryption_key="your-32-char-key-here!!!!!!!",
        ...     integrations={
        ...         "github": {
        ...             "client_id": "...",
        ...             "client_secret": "...",
        ...         }
        ...     }
        ... )
        >>> plug.providers.register(github_provider)
        >>> issue = await plug.github.issues.create(
        ...     user_id="user-123",
        ...     params={"owner": "org", "repo": "repo", "title": "Bug"}
        ... )
    """

    def __init__(
        self,
        database: DatabaseAdapter,
        auth: AuthProvider,
        base_url: str,
        encryption_key: str,
        integrations: Dict[str, Dict[str, Any]],
        **kwargs: Any,
    ) -> None:
        """Initialize PlugFn instance.

        Args:
            database: Database adapter for storing connections, workflows, etc.
            auth: Auth provider for authenticating requests
            base_url: Base URL of your application (for OAuth callbacks)
            encryption_key: 32-character encryption key for storing credentials
            integrations: Dict of provider configurations
            **kwargs: Additional configuration (logger, retry, rate_limit, cache, webhooks)
        """
        from ..storage.connection_storage import ConnectionStorage
        from ..storage.workflow_storage import WorkflowStorage
        from ..utils.logger import ConsoleLogger
        from ..webhooks.webhook_handler import WebhookHandler
        from .action_executor import ActionExecutor
        from .connection_manager import ConnectionManager
        from .provider_registry import ProviderRegistry
        from .workflow_engine import WorkflowEngine

        self.config = PlugFnConfig(
            database=database,
            auth=auth,
            base_url=base_url,
            encryption_key=encryption_key,
            integrations=integrations,
            **kwargs,
        )

        # Initialize logger
        self._logger = self.config.logger or ConsoleLogger("[PlugFn]")

        # Initialize storage
        self._connection_storage = ConnectionStorage(database)
        self._workflow_storage = WorkflowStorage(database)

        # Initialize provider registry
        self._provider_registry = ProviderRegistry(self._logger)

        # Mark configured providers
        for provider_name in integrations.keys():
            self._provider_registry.mark_configured(provider_name)

        # Initialize managers
        self._connection_manager = ConnectionManager(
            storage=self._connection_storage,
            providers=self._provider_registry,
            integration_configs=integrations,
            base_url=base_url,
            encryption_key=encryption_key,
            logger=self._logger,
        )

        self._action_executor = ActionExecutor(
            connection_manager=self._connection_manager,
            provider_registry=self._provider_registry,
            logger=self._logger,
            enable_retry=self.config.retry.get("enabled", True),
            enable_rate_limit=self.config.rate_limit.get("enabled", True),
            enable_cache=self.config.cache.get("enabled", True),
        )

        self._webhook_handler = WebhookHandler(
            provider_registry=self._provider_registry, logger=self._logger
        )

        self._workflow_engine = WorkflowEngine(
            storage=self._workflow_storage,
            webhook_handler=self._webhook_handler,
            logger=self._logger,
        )

        # Create public APIs
        self.connections = ConnectionsAPI(self._connection_manager)
        self.workflows = WorkflowsAPI(self._workflow_engine)
        self.webhooks = WebhooksAPI(self._webhook_handler)
        self.providers = ProvidersAPI(self._provider_registry)

        # Event handlers
        self._event_handlers: Dict[str, List[Callable[..., Any]]] = {}

        # Provider proxies cache
        self._provider_proxies: Dict[str, ProviderProxy] = {}

    def __getattr__(self, name: str) -> Any:
        """Dynamic provider access via attribute.

        Args:
            name: Provider name

        Returns:
            Provider proxy for executing actions
        """
        # Check if provider exists
        provider = self._provider_registry.get_provider(name)
        if provider is None:
            raise AttributeError(
                f"Provider '{name}' not found. Make sure to register it first."
            )

        # Return cached proxy if available
        if name in self._provider_proxies:
            return self._provider_proxies[name]

        # Create provider proxy
        proxy = ProviderProxy(
            provider_name=name,
            provider=provider,
            action_executor=self._action_executor,
            webhook_handler=self._webhook_handler,
        )

        # Cache it
        self._provider_proxies[name] = proxy

        return proxy

    async def batch(self, actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Execute multiple actions in batch.

        Args:
            actions: List of action definitions

        Returns:
            List of action results
        """
        return await self._action_executor.batch(actions)

    async def get_metrics(
        self, time_range: Optional[str] = None, **filters: Any
    ) -> Dict[str, Any]:
        """Get metrics about action executions.

        Args:
            time_range: Time range filter (e.g., "last-24h")
            **filters: Additional filters

        Returns:
            Metrics data
        """
        return await self._action_executor.get_metrics(
            time_range=time_range, **filters
        )

    def on(self, event: str, handler: Callable[..., Any]) -> None:
        """Register an event handler.

        Args:
            event: Event name
            handler: Event handler function
        """
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def off(self, event: str, handler: Callable[..., Any]) -> None:
        """Unregister an event handler.

        Args:
            event: Event name
            handler: Handler to remove
        """
        if event in self._event_handlers:
            self._event_handlers[event].remove(handler)


class ProviderProxy:
    """Proxy object for accessing provider actions dynamically."""

    def __init__(
        self,
        provider_name: str,
        provider: Provider,
        action_executor: "ActionExecutor",
        webhook_handler: "WebhookHandler",
    ) -> None:
        self._provider_name = provider_name
        self._provider = provider
        self._action_executor = action_executor
        self._webhook_handler = webhook_handler

    def on(self, event: str, handler: Callable[..., Any]) -> None:
        """Register a webhook handler for this provider.

        Args:
            event: Event name
            handler: Event handler function
        """
        self._webhook_handler.register_handler(self._provider_name, event, handler)

    def __getattr__(self, action_name: str) -> Any:
        """Get an action executor function.

        Args:
            action_name: Action name

        Returns:
            Async function to execute the action
        """
        actions = self._provider.actions if hasattr(self._provider, "actions") else {}

        matching_prefix = f"{action_name}."
        if any(name.startswith(matching_prefix) for name in actions.keys()):
            return ActionNamespaceProxy(self, action_name)

        # Check if action exists
        if action_name not in actions:
            raise AttributeError(
                f"Action '{action_name}' not found in provider '{self._provider_name}'"
            )

        # Return action executor
        async def execute_action(
            user_id: str,
            params: Dict[str, Any],
            connection_id: Optional[str] = None,
            **options: Any,
        ) -> Any:
            """Execute the action.

            Args:
                user_id: User ID
                params: Action parameters
                connection_id: Optional specific connection ID
                **options: Additional options (retry, timeout, cache)

            Returns:
                Action result data
            """
            result = await self._action_executor.execute(
                provider=self._provider_name,
                action=action_name,
                user_id=user_id,
                params=params,
                connection_id=connection_id,
                **options,
            )

            if not result["success"]:
                raise result["error"]

            return result["data"]

        return execute_action


class ActionNamespaceProxy:
    """Nested proxy for dotted provider action groups such as issues.create."""

    def __init__(self, provider_proxy: ProviderProxy, namespace: str) -> None:
        self._provider_proxy = provider_proxy
        self._namespace = namespace

    def __getattr__(self, action_name: str) -> Any:
        return getattr(self._provider_proxy, f"{self._namespace}.{action_name}")
