from datetime import datetime
from typing import Any, AsyncGenerator, Dict, Optional, Protocol, Union

from pydantic import BaseModel


class StorageObject(BaseModel):
    key: str
    size: int
    etag: str
    lastModified: Union[str, datetime]
    metadata: Optional[Dict[str, str]] = None


class StorageAdapter(Protocol):
    capabilities: Optional[Dict[str, bool]]
    def capabilities_for_target(self, target: str) -> Dict[str, bool]: ...

    async def get_object(self, key: str, target: Optional[str] = None) -> StorageObject: ...

    async def put_object(
        self,
        key: str,
        data: Union[bytes, Any],
        metadata: Optional[Dict[str, str]] = None,
        target: Optional[str] = None,
    ) -> StorageObject: ...

    async def delete_object(self, key: str, target: Optional[str] = None) -> None: ...

    async def open_download_stream(self, key: str, target: Optional[str] = None) -> AsyncGenerator[bytes, None]: ...

    async def sign_download_url(self, key: str, expires_in_seconds: int, target: Optional[str] = None) -> Dict[str, Any]: ...

    async def create_multipart_upload(
        self,
        key: str,
        metadata: Optional[Dict[str, str]] = None,
        content_type: Optional[str] = None,
        target: Optional[str] = None,
    ) -> str: ...

    async def sign_multipart_upload_part_url(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        expires_in_seconds: int,
        constraints: Optional[Dict[str, Any]] = None,
        target: Optional[str] = None,
    ) -> Dict[str, Any]: ...

    async def upload_part(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        data: bytes,
        target: Optional[str] = None,
    ) -> str: ...

    async def complete_multipart_upload(
        self,
        key: str,
        upload_id: str,
        parts: list[Dict[str, Any]],
        target: Optional[str] = None,
    ) -> StorageObject: ...

    async def abort_multipart_upload(self, key: str, upload_id: str, target: Optional[str] = None) -> None: ...
