from __future__ import annotations

from typing import Any, Dict, Optional, cast

from . import errors

STORAGE_TARGET_NOT_CONFIGURED = "FILEFN_STORAGE_TARGET_NOT_CONFIGURED"


class StorageRoutingError(Exception):
    def __init__(self, target: str):
        super().__init__(f"Storage target '{target}' is not configured")
        self.code = STORAGE_TARGET_NOT_CONFIGURED
        self.target = target


def _merge_capabilities(adapters: Dict[str, Any]) -> Dict[str, bool]:
    keys = (
        "signedUploadUrls",
        "signedDownloadUrls",
        "multipart",
        "proxyStreamingUpload",
        "proxyStreamingDownload",
    )
    return {
        key: all(bool((getattr(adapter, "capabilities", {}) or {}).get(key)) for adapter in adapters.values())
        for key in keys
    }


def get_storage_capabilities(adapter: Any, target: Optional[str] = None) -> Dict[str, bool]:
    if target and hasattr(adapter, "capabilities_for_target"):
        return cast(Dict[str, bool], adapter.capabilities_for_target(target))
    return cast(Dict[str, bool], getattr(adapter, "capabilities", {}) or {})


class RoutedStorageAdapter:
    def __init__(self, adapters: Dict[str, Any], default_target: Optional[str] = None, name: str = "routed"):
        if not adapters:
            raise ValueError("create_routed_storage_adapter requires at least one target adapter")

        self._adapters = dict(adapters)
        self.default_target = default_target or next(iter(self._adapters.keys()))
        if self.default_target not in self._adapters:
            raise StorageRoutingError(self.default_target)

        self.name = name
        self.targets = list(self._adapters.keys())
        self.capabilities = _merge_capabilities(self._adapters)

    def _pick(self, target: Optional[str]) -> tuple[Any, str]:
        resolved = target or self.default_target
        adapter = self._adapters.get(resolved)
        if adapter is None:
            raise StorageRoutingError(resolved)
        return adapter, resolved

    def capabilities_for_target(self, target: str) -> Dict[str, bool]:
        adapter, _ = self._pick(target)
        return dict(getattr(adapter, "capabilities", {}) or {})

    async def get_object(self, key: str, target: Optional[str] = None) -> Any:
        adapter, _ = self._pick(target)
        return await adapter.get_object(key=key)

    async def put_object(
        self,
        key: str,
        data: Any,
        metadata: Optional[Dict[str, str]] = None,
        target: Optional[str] = None,
    ) -> Any:
        adapter, _ = self._pick(target)
        return await adapter.put_object(key=key, data=data, metadata=metadata)

    async def delete_object(self, key: str, target: Optional[str] = None) -> None:
        adapter, _ = self._pick(target)
        await adapter.delete_object(key=key)

    async def open_download_stream(self, key: str, target: Optional[str] = None) -> Any:
        adapter, _ = self._pick(target)
        return await adapter.open_download_stream(key=key)

    async def sign_download_url(self, key: str, expires_in_seconds: int, target: Optional[str] = None) -> Dict[str, Any]:
        adapter, resolved = self._pick(target)
        if not hasattr(adapter, "sign_download_url"):
            raise RuntimeError(f"Storage target '{resolved}' does not support signed download URLs")
        result = await adapter.sign_download_url(key=key, expires_in_seconds=expires_in_seconds)
        return cast(Dict[str, Any], result)

    async def create_multipart_upload(
        self,
        key: str,
        metadata: Optional[Dict[str, str]] = None,
        content_type: Optional[str] = None,
        target: Optional[str] = None,
    ) -> Any:
        adapter, resolved = self._pick(target)
        if not hasattr(adapter, "create_multipart_upload"):
            raise RuntimeError(f"Storage target '{resolved}' does not support multipart uploads")
        try:
            return await adapter.create_multipart_upload(key=key, metadata=metadata, content_type=content_type)
        except TypeError:
            return await adapter.create_multipart_upload(key=key, metadata=metadata)

    async def sign_multipart_upload_part_url(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        expires_in_seconds: int,
        constraints: Optional[Dict[str, Any]] = None,
        target: Optional[str] = None,
    ) -> Dict[str, Any]:
        adapter, resolved = self._pick(target)
        if not hasattr(adapter, "sign_multipart_upload_part_url"):
            raise RuntimeError(f"Storage target '{resolved}' does not support multipart uploads")
        result = await adapter.sign_multipart_upload_part_url(
            key=key,
            upload_id=upload_id,
            part_number=part_number,
            expires_in_seconds=expires_in_seconds,
            constraints=constraints,
        )
        return cast(Dict[str, Any], result)

    async def upload_part(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        data: bytes,
        target: Optional[str] = None,
    ) -> str:
        adapter, resolved = self._pick(target)
        if not hasattr(adapter, "upload_part"):
            raise RuntimeError(f"Storage target '{resolved}' does not support multipart uploads")
        result = await adapter.upload_part(key=key, upload_id=upload_id, part_number=part_number, data=data)
        if isinstance(result, str) and result:
            return result
        if isinstance(result, dict):
            etag = result.get("etag") or result.get("ETag")
            if isinstance(etag, str) and etag:
                return etag
        raise errors.invalid_etag()

    async def complete_multipart_upload(
        self,
        key: str,
        upload_id: str,
        parts: list[Dict[str, Any]],
        target: Optional[str] = None,
    ) -> Any:
        adapter, resolved = self._pick(target)
        if not hasattr(adapter, "complete_multipart_upload"):
            raise RuntimeError(f"Storage target '{resolved}' does not support multipart uploads")
        return await adapter.complete_multipart_upload(key=key, upload_id=upload_id, parts=parts)

    async def abort_multipart_upload(self, key: str, upload_id: str, target: Optional[str] = None) -> None:
        adapter, resolved = self._pick(target)
        if not hasattr(adapter, "abort_multipart_upload"):
            raise RuntimeError(f"Storage target '{resolved}' does not support multipart uploads")
        await adapter.abort_multipart_upload(key=key, upload_id=upload_id)


def create_routed_storage_adapter(
    adapters: Dict[str, Any],
    default_target: Optional[str] = None,
    name: str = "routed",
) -> RoutedStorageAdapter:
    return RoutedStorageAdapter(adapters=adapters, default_target=default_target, name=name)
