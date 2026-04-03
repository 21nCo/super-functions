from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

import pytest

from filefn.server import (
    STORAGE_TARGET_NOT_CONFIGURED,
    StorageRoutingError,
    create_routed_storage_adapter,
    get_storage_capabilities,
)


class FakeTargetStorage:
    def __init__(self, name: str, capabilities: Optional[Dict[str, bool]] = None) -> None:
        self.name = name
        self.capabilities = capabilities or {
            "signedUploadUrls": True,
            "signedDownloadUrls": True,
            "multipart": True,
            "proxyStreamingUpload": True,
            "proxyStreamingDownload": True,
        }
        self.calls: list[str] = []

    async def get_object(self, key: str) -> Dict[str, Any]:
        self.calls.append(f"{self.name}:get:{key}")
        return {
            "key": key,
            "size": 1,
            "etag": "etag",
            "lastModified": datetime.now(timezone.utc).isoformat(),
            "metadata": {},
        }

    async def put_object(self, key: str, data: bytes, metadata: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        self.calls.append(f"{self.name}:put:{key}")
        return {
            "key": key,
            "size": len(data),
            "etag": "etag",
            "lastModified": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
        }

    async def delete_object(self, key: str) -> None:
        self.calls.append(f"{self.name}:delete:{key}")

    async def open_download_stream(self, key: str):
        self.calls.append(f"{self.name}:download:{key}")

        async def _gen():
            yield b"data"

        return _gen()

    async def sign_download_url(self, key: str, expires_in_seconds: int) -> Dict[str, Any]:
        self.calls.append(f"{self.name}:sign:{key}")
        return {"url": f"https://{self.name}.local/{key}", "headers": {}}

    async def create_multipart_upload(
        self,
        key: str,
        metadata: Optional[Dict[str, str]] = None,
        content_type: Optional[str] = None,
    ) -> str:
        self.calls.append(f"{self.name}:multipart:{key}")
        return f"{self.name}-upload"

    async def sign_multipart_upload_part_url(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        expires_in_seconds: int,
        constraints: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self.calls.append(f"{self.name}:part:{key}:{part_number}")
        return {"url": f"https://{self.name}.local/{upload_id}/{part_number}", "headers": {}}

    async def upload_part(self, key: str, upload_id: str, part_number: int, data: bytes) -> str:
        self.calls.append(f"{self.name}:upload-part:{key}:{part_number}")
        return "etag"

    async def complete_multipart_upload(self, key: str, upload_id: str, parts: list[Dict[str, Any]]) -> Dict[str, Any]:
        self.calls.append(f"{self.name}:complete:{key}")
        return {
            "key": key,
            "size": 1,
            "etag": "etag",
            "lastModified": datetime.now(timezone.utc).isoformat(),
            "metadata": {},
        }

    async def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        self.calls.append(f"{self.name}:abort:{key}")


@pytest.mark.asyncio
async def test_routed_storage_imports_and_routes_calls() -> None:
    durable = FakeTargetStorage("durable")
    temporary = FakeTargetStorage("temporary")
    storage = create_routed_storage_adapter({"durable": durable, "temporary": temporary}, default_target="durable")

    await storage.create_multipart_upload(key="files/a.png", target="durable")
    await storage.sign_download_url(key="files/b.png", expires_in_seconds=60, target="temporary")

    assert "durable:multipart:files/a.png" in durable.calls
    assert "temporary:sign:files/b.png" in temporary.calls
    assert get_storage_capabilities(storage, "durable")["multipart"] is True


@pytest.mark.asyncio
async def test_routed_storage_unknown_target_raises_stable_error() -> None:
    storage = create_routed_storage_adapter({"durable": FakeTargetStorage("durable")}, default_target="durable")

    with pytest.raises(StorageRoutingError) as exc_info:
        await storage.sign_download_url(key="files/missing.png", expires_in_seconds=60, target="temporary")

    assert exc_info.value.code == STORAGE_TARGET_NOT_CONFIGURED
    assert exc_info.value.target == "temporary"
