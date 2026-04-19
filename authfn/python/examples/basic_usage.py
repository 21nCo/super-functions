"""Basic usage example for authfn."""

import asyncio
from typing import Any, Dict, List, Optional

from authfn import AuthFnConfig, create_authfn
from authfn.types import ApiKeyCreate, OrderByClause, WhereClause


class SimpleDatabaseAdapter:
    """
    Simple in-memory database adapter for demonstration.
    In production, you would use a real database adapter.
    """

    def __init__(self):
        self._storage: Dict[str, List[Dict[str, Any]]] = {}

    async def find_one(
        self,
        model: str,
        where: List[WhereClause],
        namespace: str,
    ) -> Optional[Dict[str, Any]]:
        """Find a single record."""
        for item in self._storage.get(model, []):
            match = True
            for clause in where:
                if clause.operator == "eq":
                    if item.get(clause.field) != clause.value:
                        match = False
                        break
            if match:
                return item
        return None

    async def find_many(
        self,
        model: str,
        where: List[WhereClause],
        order_by: Optional[List[OrderByClause]],
        namespace: str,
    ) -> List[Dict[str, Any]]:
        """Find multiple records."""
        results = []
        for item in self._storage.get(model, []):
            match = True
            for clause in where:
                if clause.operator == "eq":
                    if item.get(clause.field) != clause.value:
                        match = False
                        break
                elif clause.operator == "contains":
                    field_value = item.get(clause.field)
                    if not isinstance(field_value, list) or clause.value not in field_value:
                        match = False
                        break
            if match:
                results.append(item)
        return results

    async def create(
        self,
        model: str,
        data: Dict[str, Any],
        namespace: str,
    ) -> None:
        """Create a new record."""
        if model not in self._storage:
            self._storage[model] = []
        self._storage[model].append(data.copy())

    async def update(
        self,
        model: str,
        where: List[WhereClause],
        data: Dict[str, Any],
        namespace: str,
    ) -> None:
        """Update records."""
        for item in self._storage.get(model, []):
            match = True
            for clause in where:
                if clause.operator == "eq":
                    if item.get(clause.field) != clause.value:
                        match = False
                        break
            if match:
                item.update(data)


class SimpleRequest:
    """Simple request wrapper."""

    def __init__(self, token: str):
        self._headers = {"Authorization": f"Bearer {token}"}

    @property
    def headers(self) -> Dict[str, str]:
        return self._headers


async def main():
    """Run the example."""
    print("=== authfn Python SDK Example ===\n")

    # 1. Setup
    print("1. Setting up authfn with in-memory adapter...")
    adapter = SimpleDatabaseAdapter()
    auth = create_authfn(
        AuthFnConfig(
            database=adapter,
            namespace="authfn",
        )
    )
    print("✓ Setup complete\n")

    # 2. Create an API key
    print("2. Creating an API key...")
    result = await auth.create_key(
        ApiKeyCreate(
            name="My App Key",
            resourceIds=["app-1", "app-2"],
            scopes=["read", "write"],
            metadata={"environment": "development"},
        )
    )
    print("✓ Created API key")
    print(f"  ID: {result.id}")
    print(f"  Key: {result.key[:20]}... (truncated)")
    print()

    # 3. Authenticate with the API key
    print("3. Authenticating with the API key...")
    request = SimpleRequest(result.key)
    session = await auth.provider.authenticate(request)

    if session:
        print("✓ Authentication successful!")
        print(f"  Session ID: {session.id}")
        print(f"  Name: {session.name}")
        print(f"  Type: {session.type}")
        print(f"  Resource IDs: {session.resource_ids}")
        print(f"  Scopes: {session.scopes}")
        print()
    else:
        print("✗ Authentication failed")
        return

    # 4. Authorize resource access
    print("4. Checking resource authorization...")
    can_access_app1 = await auth.provider.authorize(session, "app-1")
    can_access_app3 = await auth.provider.authorize(session, "app-3")
    print(f"  Can access 'app-1': {can_access_app1}")
    print(f"  Can access 'app-3': {can_access_app3}")
    print()

    # 5. Create more API keys
    print("5. Creating additional API keys...")
    await auth.create_key(
        ApiKeyCreate(
            name="Mobile App Key",
            resourceIds=["app-1"],
            scopes=["read"],
        )
    )
    await auth.create_key(
        ApiKeyCreate(
            name="Integration Key",
            resourceIds=["app-2"],
            scopes=["read", "write", "delete"],
        )
    )
    print("✓ Created 2 more API keys\n")

    # 6. List all API keys
    print("6. Listing all API keys...")
    all_keys = await auth.list_keys()
    print(f"✓ Found {len(all_keys)} API keys:")
    for key in all_keys:
        print(f"  - {key.name} (ID: {key.id})")
        print(f"    Resources: {key.resource_ids}")
        print(f"    Scopes: {key.scopes}")
    print()

    # 7. List keys for specific resource
    print("7. Listing keys for 'app-1'...")
    app1_keys = await auth.list_keys(filters={"resourceId": "app-1"})
    print(f"✓ Found {len(app1_keys)} API keys for 'app-1':")
    for key in app1_keys:
        print(f"  - {key.name}")
    print()

    # 8. Get a specific key
    print("8. Getting specific API key details...")
    key_details = await auth.get_key(result.id)
    if key_details:
        print("✓ Key details:")
        print(f"  Name: {key_details.name}")
        print(f"  Resources: {key_details.resource_ids}")
        print(f"  Created: {key_details.created_at}")
        print(f"  Last used: {key_details.last_used_at}")
    print()

    # 9. Revoke an API key
    print("9. Revoking an API key...")
    await auth.revoke_key(result.id)
    revoked_key = await auth.get_key(result.id)
    if revoked_key and revoked_key.revoked_at:
        print(f"✓ Key revoked at: {revoked_key.revoked_at}")
    print()

    # 10. Try to authenticate with revoked key
    print("10. Attempting to authenticate with revoked key...")
    try:
        await auth.provider.authenticate(request)
        print("✗ Authentication should have failed!")
    except Exception as e:
        print(f"✓ Authentication correctly rejected: {e}")
    print()

    print("=== Example completed successfully! ===")


if __name__ == "__main__":
    asyncio.run(main())
