"""Connection storage using database adapter."""

from typing import Any, Dict, List, Optional

from ..types import Connection


class ConnectionStorage:
    """Storage layer for connections."""

    def __init__(self, adapter: Any):
        """Initialize connection storage.

        Args:
            adapter: Database adapter
        """
        self.adapter = adapter

    async def create_connection(self, connection: Connection) -> None:
        """Create a new connection.

        Args:
            connection: Connection to create
        """
        await self.adapter.createConnection(connection.model_dump())

    async def get_connection(self, connection_id: str) -> Optional[Connection]:
        """Get a connection by ID.

        Args:
            connection_id: Connection ID

        Returns:
            Connection or None if not found
        """
        data = await self.adapter.getConnection(connection_id)
        if not data:
            return None

        return Connection(**data)

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
        data_list = await self.adapter.listConnections(user_id, provider)
        return [Connection(**data) for data in data_list]

    async def update_connection(
        self, connection_id: str, updates: Dict[str, Any]
    ) -> None:
        """Update a connection.

        Args:
            connection_id: Connection ID
            updates: Fields to update
        """
        await self.adapter.updateConnection(connection_id, updates)

    async def delete_connection(self, connection_id: str) -> None:
        """Delete a connection.

        Args:
            connection_id: Connection ID
        """
        await self.adapter.deleteConnection(connection_id)
