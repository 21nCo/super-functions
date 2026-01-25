from typing import Any, Dict, List, Optional, Protocol, Union, AsyncContextManager

class Adapter(Protocol):
    async def find_many(
        self, 
        model: str, 
        where: List[Dict[str, Any]], 
        limit: Optional[int] = None,
        sort: Optional[List[str]] = None,
        cursor: Optional[Dict[str, Any]] = None,
        namespace: str = "datafn"
    ) -> List[Dict[str, Any]]:
        ...
        
    async def find_one(self, model: str, where: List[Dict[str, Any]], namespace: str = "datafn") -> Optional[Dict[str, Any]]:
        ...

    async def create(self, model: str, data: Dict[str, Any], namespace: str = "datafn") -> None:
        ...
        
    async def update(self, model: str, where: List[Dict[str, Any]], data: Dict[str, Any], namespace: str = "datafn") -> None:
        ...
        
    async def delete(self, model: str, where: List[Dict[str, Any]], namespace: str = "datafn") -> None:
        ...

    def transaction(self) -> AsyncContextManager["Adapter"]:
        """
        Returns an async context manager that yields a transactional Adapter instance.
        If the context exits without error, the transaction is committed.
        If an error occurs, the transaction is rolled back.
        """
        ...
