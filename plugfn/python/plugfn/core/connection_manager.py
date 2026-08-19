"""Connection manager for handling user connections to providers."""

import asyncio
import json
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from weakref import WeakValueDictionary

from ..auth.oauth_flow import OAuthFlowHandler
from ..auth.token_store import MemoryTokenStore, TokenStore
from ..storage.connection_storage import ConnectionStorage
from ..storage.token_storage import SecureTokenStorage
from ..types import AuthType, Connection, ConnectionStatus


class ConnectionManager:
    """Manages user connections to providers."""

    def __init__(
        self,
        storage: ConnectionStorage,
        providers: Any,  # ProviderRegistry
        integration_configs: Dict[str, Dict[str, Any]],
        base_url: str,
        encryption_key: str,
        logger: Any,
        oauth_state_store: Optional[TokenStore] = None,
    ):
        """Initialize connection manager.

        Args:
            storage: Connection storage
            providers: Provider registry
            integration_configs: Provider integration configurations
            base_url: Base URL for OAuth callbacks
            encryption_key: Encryption key for token storage
            logger: Logger instance
        """
        self.storage = storage
        self.providers = providers
        self.integration_configs = integration_configs
        self.base_url = base_url
        self.logger = logger

        self.token_storage = SecureTokenStorage(encryption_key)
        self.oauth_handler = OAuthFlowHandler(oauth_state_store or MemoryTokenStore())
        self._json_encoder = json.JSONEncoder()
        self._credential_refresh_locks: WeakValueDictionary[
            str, asyncio.Lock
        ] = WeakValueDictionary()

    async def get_auth_url(
        self,
        provider: str,
        user_id: str,
        redirect_uri: str,
        scopes: Optional[List[str]] = None,
        state: Optional[str] = None,
        connection_name: Optional[str] = None,
    ) -> str:
        """Generate OAuth authorization URL.

        Args:
            provider: Provider name
            user_id: User ID
            redirect_uri: OAuth redirect URI
            scopes: Optional list of scopes
            state: Optional state parameter
            connection_name: Optional connection name

        Returns:
            Authorization URL

        Raises:
            ValueError: If provider not found or not configured
        """
        provider_obj = self.providers.get_provider(provider)
        if not provider_obj:
            raise ValueError(f"Provider {provider} not found")

        if provider_obj.auth_type != AuthType.OAUTH2:
            raise ValueError(f"Provider {provider} does not support OAuth2")

        config = self.integration_configs.get(provider)
        if not config:
            raise ValueError(f"Provider {provider} not configured")

        # Get OAuth config from provider
        oauth_config = provider_obj.auth_config
        if oauth_config is None:
            raise ValueError(f"Provider {provider} has no OAuth configuration")

        client_id = self._required_config_string(config, "client_id", provider)
        client_secret = self._required_config_string(config, "client_secret", provider)
        configured_scopes = oauth_config.get("scopes", [])
        default_scopes = (
            [scope for scope in configured_scopes if isinstance(scope, str)]
            if isinstance(configured_scopes, list)
            else []
        )

        # Generate state if not provided
        if not state:
            state = secrets.token_urlsafe(32)

        # Build authorization URL
        url, final_state = await self.oauth_handler.get_authorization_url(
            oauth_config=oauth_config,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            scopes=scopes or default_scopes,
            state=state,
        )

        # Store state data
        state_data = {
            "user_id": user_id,
            "provider": provider,
            "redirect_uri": redirect_uri,
            "scopes": scopes,
            "connection_name": connection_name,
            "timestamp": datetime.now().isoformat(),
        }

        await self.oauth_handler.token_store.set(
            f"oauth:state:{final_state}", self._encode_json(state_data), ttl=600
        )

        self.logger.info(f"Generated auth URL for {provider}", {"user_id": user_id})
        return url

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

        Raises:
            ValueError: If state is invalid or provider not configured
        """
        # Verify and retrieve state data
        state_key = f"oauth:state:{state}"
        state_data_str = await self.oauth_handler.token_store.get(state_key)

        if not state_data_str:
            raise ValueError("Invalid or expired OAuth state")

        state_data = self._decode_json_object(state_data_str)
        await self.oauth_handler.token_store.delete(state_key)

        state_provider = state_data.get("provider")
        if not isinstance(state_provider, str) or not state_provider:
            raise ValueError("Provider missing from OAuth state")

        # Legacy callback routes may supply the provider explicitly; the
        # canonical route resolves it from the authenticated OAuth state.
        if provider is not None and state_provider != provider:
            raise ValueError("Provider mismatch in OAuth callback")
        provider = state_provider

        provider_obj = self.providers.get_provider(provider)
        if not provider_obj:
            raise ValueError(f"Provider {provider} not found")

        config = self.integration_configs.get(provider)
        if not config:
            raise ValueError(f"Provider {provider} not configured")

        client_id = self._required_config_string(config, "client_id", provider)
        client_secret = self._required_config_string(config, "client_secret", provider)
        oauth_config = provider_obj.auth_config
        if oauth_config is None:
            raise ValueError(f"Provider {provider} has no OAuth configuration")

        redirect_uri = state_data.get("redirect_uri")
        user_id = state_data.get("user_id")
        if not isinstance(redirect_uri, str) or not redirect_uri:
            raise ValueError("Redirect URI missing from OAuth state")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("User ID missing from OAuth state")

        # Exchange code for tokens
        tokens = await self.oauth_handler.exchange_code_for_token(
            oauth_config=oauth_config,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            code=code,
        )

        # Encrypt credentials
        encrypted_creds = self.token_storage.encrypt(self._encode_json(tokens))

        # Create connection
        connection_id = f"conn_{secrets.token_urlsafe(16)}"
        now = datetime.now()

        expires_at = None
        expires_in = tokens.get("expires_in")
        if isinstance(expires_in, (int, float)) and not isinstance(expires_in, bool):
            expires_at = now + timedelta(seconds=expires_in)

        connection = Connection(
            id=connection_id,
            user_id=user_id,
            provider=provider,
            name=state_data.get("connection_name"),
            status=ConnectionStatus.ACTIVE,
            credentials=encrypted_creds,
            scopes=state_data.get("scopes"),
            metadata={},
            expires_at=expires_at,
            connected_at=now,
            last_used_at=None,
            created_at=now,
            updated_at=now,
        )

        # Store connection
        await self.storage.create_connection(connection)

        self.logger.info(
            f"Created connection for {provider}",
            {"user_id": user_id, "connection_id": connection_id},
        )

        return connection

    async def list_connections(
        self, user_id: str, provider: Optional[str] = None
    ) -> List[Connection]:
        """List connections for a user.

        Args:
            user_id: User ID
            provider: Optional provider filter

        Returns:
            List of connections
        """
        return await self.storage.list_connections(user_id, provider)

    async def get_connection(self, connection_id: str) -> Connection:
        """Get a connection by ID.

        Args:
            connection_id: Connection ID

        Returns:
            Connection

        Raises:
            ValueError: If connection not found
        """
        connection = await self.storage.get_connection(connection_id)
        if not connection:
            raise ValueError(f"Connection {connection_id} not found")
        return connection

    async def disconnect(self, connection_id: str, user_id: str) -> None:
        """Disconnect and delete a connection.

        Args:
            connection_id: Connection ID
            user_id: User ID for verification

        Raises:
            ValueError: If connection not found or user mismatch
        """
        connection = await self.get_connection(connection_id)

        if connection.user_id != user_id:
            raise ValueError("User mismatch - cannot disconnect this connection")

        await self.storage.delete_connection(connection_id)

        self.logger.info(
            f"Disconnected {connection.provider}",
            {"user_id": user_id, "connection_id": connection_id},
        )

    async def refresh_connection(self, connection_id: str) -> Connection:
        """Refresh a connection's credentials.

        Args:
            connection_id: Connection ID

        Returns:
            Updated connection

        Raises:
            ValueError: If connection doesn't support refresh or refresh fails
        """
        refresh_lock = self._credential_refresh_lock(connection_id)
        async with refresh_lock:
            connection = await self.get_connection(connection_id)
            return await self._refresh_connection_locked(connection)

    async def _refresh_connection_locked(self, connection: Connection) -> Connection:
        """Refresh a connection while its per-connection lock is held."""
        connection_id = connection.id

        provider_obj = self.providers.get_provider(connection.provider)
        if not provider_obj:
            raise ValueError(f"Provider {connection.provider} not found")

        if provider_obj.auth_type != AuthType.OAUTH2:
            raise ValueError(
                f"Provider {connection.provider} does not support token refresh"
            )

        # Decrypt credentials
        creds_str = self.token_storage.decrypt(connection.credentials)
        creds = self._decode_json_object(creds_str)

        refresh_token = creds.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token:
            raise ValueError("No refresh token available")

        config = self.integration_configs.get(connection.provider)
        if not config:
            raise ValueError(f"Provider {connection.provider} not configured")

        client_id = self._required_config_string(config, "client_id", connection.provider)
        client_secret = self._required_config_string(
            config, "client_secret", connection.provider
        )
        oauth_config = provider_obj.auth_config
        if oauth_config is None:
            raise ValueError(
                f"Provider {connection.provider} has no OAuth configuration"
            )

        # Refresh tokens
        new_tokens = await self.oauth_handler.refresh_token(
            oauth_config=oauth_config,
            client_id=client_id,
            client_secret=client_secret,
            refresh_token=refresh_token,
        )

        # Providers commonly omit refresh_token when it has not rotated.
        merged_tokens = dict(new_tokens)
        if not new_tokens.get("refresh_token"):
            merged_tokens["refresh_token"] = refresh_token
        encrypted_creds = self.token_storage.encrypt(self._encode_json(merged_tokens))

        now = datetime.now()
        expires_at = None
        expires_in = new_tokens.get("expires_in")
        if isinstance(expires_in, (int, float)) and not isinstance(expires_in, bool):
            expires_at = now + timedelta(seconds=expires_in)

        # Update connection
        await self.storage.update_connection(
            connection_id,
            {
                "credentials": encrypted_creds,
                "expires_at": expires_at,
                "status": ConnectionStatus.ACTIVE,
                "updated_at": now,
            },
        )

        # Return updated connection
        return await self.get_connection(connection_id)

    async def get_credentials(self, connection_id: str) -> Dict[str, Any]:
        """Get decrypted credentials for a connection.

        Args:
            connection_id: Connection ID

        Returns:
            Decrypted credentials dict

        Raises:
            ValueError: If connection not found
        """
        connection = await self.get_connection(connection_id)

        provider_obj = self.providers.get_provider(connection.provider)
        if (
            self._connection_is_expired(connection)
            and provider_obj is not None
            and provider_obj.auth_type == AuthType.OAUTH2
        ):
            refresh_lock = self._credential_refresh_lock(connection_id)
            async with refresh_lock:
                # Another caller may have completed the refresh while this
                # request was waiting for the per-connection lock.
                connection = await self.get_connection(connection_id)
                provider_obj = self.providers.get_provider(connection.provider)
                if (
                    self._connection_is_expired(connection)
                    and provider_obj is not None
                    and provider_obj.auth_type == AuthType.OAUTH2
                ):
                    connection = await self._refresh_connection_locked(connection)

        # Decrypt credentials
        creds_str = self.token_storage.decrypt(connection.credentials)
        return self._decode_json_object(creds_str)

    async def update_last_used(self, connection_id: str) -> None:
        """Update the last used timestamp for a connection.

        Args:
            connection_id: Connection ID
        """
        await self.storage.update_connection(
            connection_id, {"last_used_at": datetime.now()}
        )

    def resolve_webhook_secret(self, provider: str) -> Optional[str]:
        """Resolve the configured webhook secret for a provider, if present."""
        config = self.integration_configs.get(provider, {})
        for key in ("webhook_secret", "signing_secret", "webhookSigningSecret", "signingSecret"):
            value = config.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    def _credential_refresh_lock(self, connection_id: str) -> asyncio.Lock:
        lock = self._credential_refresh_locks.get(connection_id)
        if lock is None:
            lock = asyncio.Lock()
            self._credential_refresh_locks[connection_id] = lock
        return lock

    def _encode_json(self, value: Dict[str, Any]) -> str:
        return self._json_encoder.encode(value)

    @staticmethod
    def _decode_json_object(value: str) -> Dict[str, Any]:
        decoded = json.loads(value)
        if not isinstance(decoded, dict):
            raise ValueError("Stored JSON payload must be an object")
        return decoded

    @staticmethod
    def _connection_is_expired(connection: Connection) -> bool:
        expires_at = connection.expires_at
        if expires_at is None:
            return False
        now = datetime.now(tz=expires_at.tzinfo) if expires_at.tzinfo else datetime.now()
        return expires_at <= now

    @staticmethod
    def _required_config_string(
        config: Dict[str, Any], key: str, provider: str
    ) -> str:
        value = config.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"Provider {provider} requires {key}")
        return value
