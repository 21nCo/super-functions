"""Connection manager for handling user connections to providers."""

import json
import secrets
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from ..types import Connection, ConnectionStatus, AuthType
from ..storage.connection_storage import ConnectionStorage
from ..auth.oauth_flow import OAuthFlowHandler
from ..auth.token_store import MemoryTokenStore
from ..storage.token_storage import SecureTokenStorage


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
        self.oauth_handler = OAuthFlowHandler(MemoryTokenStore())
        self._json_encoder = json.JSONEncoder()

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

        # Generate state if not provided
        if not state:
            state = secrets.token_urlsafe(32)

        # Build authorization URL
        url, final_state = await self.oauth_handler.get_authorization_url(
            oauth_config=oauth_config,
            client_id=config.get("client_id"),
            client_secret=config.get("client_secret"),
            redirect_uri=redirect_uri,
            scopes=scopes or oauth_config.get("scopes", []),
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
        self, provider: str, code: str, state: str
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

        state_data = json.loads(state_data_str)
        await self.oauth_handler.token_store.delete(state_key)

        # Verify provider matches
        if state_data["provider"] != provider:
            raise ValueError("Provider mismatch in OAuth callback")

        provider_obj = self.providers.get_provider(provider)
        if not provider_obj:
            raise ValueError(f"Provider {provider} not found")

        config = self.integration_configs.get(provider)
        if not config:
            raise ValueError(f"Provider {provider} not configured")

        # Exchange code for tokens
        tokens = await self.oauth_handler.exchange_code_for_token(
            oauth_config=provider_obj.auth_config,
            client_id=config.get("client_id"),
            client_secret=config.get("client_secret"),
            redirect_uri=state_data["redirect_uri"],
            code=code,
        )

        # Encrypt credentials
        encrypted_creds = self.token_storage.encrypt(self._encode_json(tokens))

        # Create connection
        connection_id = f"conn_{secrets.token_urlsafe(16)}"
        now = datetime.now()

        expires_at = None
        if tokens.get("expires_in"):
            expires_at = now + timedelta(seconds=tokens["expires_in"])

        connection = Connection(
            id=connection_id,
            user_id=state_data["user_id"],
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
            {"user_id": state_data["user_id"], "connection_id": connection_id},
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
        connection = await self.get_connection(connection_id)

        provider_obj = self.providers.get_provider(connection.provider)
        if not provider_obj:
            raise ValueError(f"Provider {connection.provider} not found")

        if provider_obj.auth_type != AuthType.OAUTH2:
            raise ValueError(
                f"Provider {connection.provider} does not support token refresh"
            )

        # Decrypt credentials
        creds_str = self.token_storage.decrypt(connection.credentials)
        creds = json.loads(creds_str)

        if "refresh_token" not in creds:
            raise ValueError("No refresh token available")

        config = self.integration_configs.get(connection.provider)
        if not config:
            raise ValueError(f"Provider {connection.provider} not configured")

        # Refresh tokens
        new_tokens = await self.oauth_handler.refresh_token(
            oauth_config=provider_obj.auth_config,
            client_id=config.get("client_id"),
            client_secret=config.get("client_secret"),
            refresh_token=creds["refresh_token"],
        )

        # Update credentials
        encrypted_creds = self.token_storage.encrypt(self._encode_json(new_tokens))

        now = datetime.now()
        expires_at = None
        if new_tokens.get("expires_in"):
            expires_at = now + timedelta(seconds=new_tokens["expires_in"])

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

        # Decrypt credentials
        creds_str = self.token_storage.decrypt(connection.credentials)
        return json.loads(creds_str)

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

    def _encode_json(self, value: Dict[str, Any]) -> str:
        return self._json_encoder.encode(value)
