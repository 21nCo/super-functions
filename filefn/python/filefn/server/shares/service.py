import hashlib
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from .. import errors
from ..models import FileProviderContext, FileRecord, FileShareRecord, FileVersionRecord
from ..policies import resolve_storage_target
from ..routed_storage import get_storage_capabilities


class CreateShareLinkInput(BaseModel):
    fileId: str
    versionId: Optional[str] = None
    expiresAt: Optional[str] = None
    requiresAuth: Optional[bool] = None
    maxDownloads: Optional[int] = None


class SharesServiceConfig(BaseModel):
    db: Any
    storage: Any
    policies: Optional[Any] = None
    logger: Optional[Any] = None
    namespace: str = "filefn"
    signed_url_ttl_seconds: int = 900

    class Config:
        arbitrary_types_allowed = True


class SharesService:
    def __init__(self, config: SharesServiceConfig):
        self.db = config.db
        self.storage = config.storage
        self.policies = config.policies
        self.logger = config.logger
        self.namespace = config.namespace
        self.signed_url_ttl_seconds = config.signed_url_ttl_seconds

    def _storage_target_for_file(self, file: FileRecord) -> str:
        policy = self.policies.get(file.policy) if self.policies else None
        return resolve_storage_target(policy)

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(32)

    def _as_utc(self, value: str) -> datetime:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    async def _get_file(self, file_id: str) -> Optional[FileRecord]:
        data = await self.db.find_one(
            model="files",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        return FileRecord(**data) if data else None

    async def _get_version(self, version_id: str) -> Optional[FileVersionRecord]:
        data = await self.db.find_one(
            model="fileVersions",
            where=[{"field": "versionId", "operator": "eq", "value": version_id}],
            namespace=self.namespace,
        )
        return FileVersionRecord(**data) if data else None

    async def _can_share_file(self, file: FileRecord, ctx: FileProviderContext) -> bool:
        return file.ownerId == ctx.principalId

    async def _reserve_download(self, token_hash: str) -> FileShareRecord:
        for _ in range(5):
            current_data = await self.db.find_one(
                model="fileShares",
                where=[{"field": "tokenHash", "operator": "eq", "value": token_hash}],
                namespace=self.namespace,
            )
            if not current_data:
                raise errors.share_not_found()

            current = FileShareRecord(**current_data)
            if current.revokedAt:
                raise errors.share_revoked()
            if current.expiresAt and self._as_utc(current.expiresAt) <= datetime.now(timezone.utc):
                raise errors.share_expired()
            if current.maxDownloads is not None and current.downloads >= current.maxDownloads:
                raise errors.share_downloads_exceeded()

            updated = await self.db.update(
                model="fileShares",
                where=[
                    {"field": "tokenHash", "operator": "eq", "value": token_hash},
                    {"field": "downloads", "operator": "eq", "value": current.downloads},
                ],
                data={"downloads": current.downloads + 1},
                namespace=self.namespace,
            )
            if updated:
                return FileShareRecord(**updated)

        raise errors.FileFnError(
            code="FILEFN_SHARE_DOWNLOAD_CONFLICT",
            message="Could not reserve share download",
            status=409,
            details={"tokenHash": token_hash},
        )

    async def create_share_link(self, input: CreateShareLinkInput, ctx: FileProviderContext) -> Dict[str, Any]:
        file = await self._get_file(input.fileId)
        if not file:
            raise errors.not_found("File")

        if not await self._can_share_file(file, ctx):
            raise errors.forbidden()

        if input.versionId:
            version = await self._get_version(input.versionId)
            if not version or version.fileId != file.fileId:
                raise errors.not_found("Version")

        token = self._generate_token()
        token_hash = self._hash_token(token)

        share = FileShareRecord(
            tokenHash=token_hash,
            fileId=input.fileId,
            versionId=input.versionId,
            expiresAt=input.expiresAt,
            requiresAuth=input.requiresAuth if input.requiresAuth is not None else False,
            maxDownloads=input.maxDownloads,
            downloads=0,
            createdAt=datetime.now(timezone.utc).isoformat(),
            revokedAt=None,
        )

        await self.db.create(
            model="fileShares",
            data=share.model_dump(),
            namespace=self.namespace,
        )

        return {"token": token, "expiresAt": share.expiresAt}

    async def download_via_share_link(
        self,
        token: str,
        ctx: FileProviderContext,
        is_authenticated: bool = False,
    ) -> Dict[str, Any]:
        token_hash = self._hash_token(token)
        data = await self.db.find_one(
            model="fileShares",
            where=[{"field": "tokenHash", "operator": "eq", "value": token_hash}],
            namespace=self.namespace,
        )

        if not data:
            raise errors.share_not_found()

        share = FileShareRecord(**data)
        if share.revokedAt:
            raise errors.share_revoked()

        if share.expiresAt and self._as_utc(share.expiresAt) <= datetime.now(timezone.utc):
            raise errors.share_expired()

        if share.maxDownloads is not None and share.downloads >= share.maxDownloads:
            raise errors.share_downloads_exceeded()

        if share.requiresAuth and not is_authenticated:
            raise errors.auth_required()

        file = await self._get_file(share.fileId)
        if not file:
            raise errors.share_not_found()

        version_id = share.versionId or file.currentVersionId
        version = await self._get_version(version_id)
        if not version:
            raise errors.not_found("Version")
        if version.fileId != file.fileId:
            raise errors.not_found("Version")
        storage_target = self._storage_target_for_file(file)

        descriptor: Dict[str, Any]
        if hasattr(self.storage, "sign_download_url") and get_storage_capabilities(self.storage, storage_target).get("signedDownloadUrls"):
            try:
                result = await self.storage.sign_download_url(
                    key=version.storageKey,
                    expires_in_seconds=self.signed_url_ttl_seconds,
                    target=storage_target,
                )
                await self._reserve_download(token_hash)
                descriptor = {
                    "url": result["url"],
                    "headers": result.get("headers"),
                    "fileName": file.name,
                    "mimeType": file.mimeType,
                }
            except Exception as exc:
                logger_warning = getattr(self.logger, "warning", None)
                if callable(logger_warning):
                    logger_warning(
                        "share signed download url generation failed; falling back to proxy",
                        {
                            "fileId": file.fileId,
                            "versionId": version.versionId,
                            "storageKey": version.storageKey,
                            "error": str(exc),
                        },
                    )
                descriptor = {
                    "url": f"/proxy/share-links/{token}/download",
                    "fileName": file.name,
                    "mimeType": file.mimeType,
                }
        else:
            descriptor = {
                "url": f"/proxy/share-links/{token}/download",
                "fileName": file.name,
                "mimeType": file.mimeType,
            }

        return descriptor

    async def get_download_stream_via_share_link(
        self,
        token: str,
        ctx: FileProviderContext,
        is_authenticated: bool = False,
    ) -> Dict[str, Any]:
        token_hash = self._hash_token(token)
        data = await self.db.find_one(
            model="fileShares",
            where=[{"field": "tokenHash", "operator": "eq", "value": token_hash}],
            namespace=self.namespace,
        )
        if not data:
            raise errors.share_not_found()

        share = FileShareRecord(**data)
        if share.revokedAt:
            raise errors.share_revoked()
        if share.expiresAt and self._as_utc(share.expiresAt) <= datetime.now(timezone.utc):
            raise errors.share_expired()
        if share.maxDownloads is not None and share.downloads >= share.maxDownloads:
            raise errors.share_downloads_exceeded()
        if share.requiresAuth and not is_authenticated:
            raise errors.auth_required()

        file = await self._get_file(share.fileId)
        if not file:
            raise errors.share_not_found()

        version_id = share.versionId or file.currentVersionId
        version = await self._get_version(version_id)
        if not version or version.fileId != file.fileId:
            raise errors.not_found("Version")

        storage_target = self._storage_target_for_file(file)
        stream = await self.storage.open_download_stream(key=version.storageKey, target=storage_target)
        await self._reserve_download(token_hash)
        return {
            "stream": stream,
            "contentType": version.mimeType,
            "size": version.size,
            "fileName": file.name,
            "mimeType": file.mimeType,
        }

    async def revoke_share_link(self, file_id: str, token: str, ctx: FileProviderContext) -> None:
        file = await self._get_file(file_id)
        if not file:
            raise errors.not_found("File")

        if not await self._can_share_file(file, ctx):
            raise errors.forbidden()

        token_hash = self._hash_token(token)
        share = await self.db.find_one(
            model="fileShares",
            where=[
                {"field": "tokenHash", "operator": "eq", "value": token_hash},
                {"field": "fileId", "operator": "eq", "value": file_id},
            ],
            namespace=self.namespace,
        )
        if not share:
            raise errors.share_not_found()

        await self.db.update(
            model="fileShares",
            where=[{"field": "tokenHash", "operator": "eq", "value": token_hash}],
            data={"revokedAt": datetime.now(timezone.utc).isoformat()},
            namespace=self.namespace,
        )

    async def list_share_links(self, file_id: str, ctx: FileProviderContext) -> List[Dict[str, Any]]:
        file = await self._get_file(file_id)
        if not file:
            raise errors.not_found("File")

        if not await self._can_share_file(file, ctx):
            raise errors.forbidden()

        shares_data = await self.db.find_many(
            model="fileShares",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )

        result: List[Dict[str, Any]] = []
        for raw in shares_data:
            share = FileShareRecord(**raw)
            row = share.model_dump()
            row.pop("tokenHash")
            row["tokenHashPrefix"] = share.tokenHash[:8]
            result.append(row)

        return result


def create_shares_service(config: SharesServiceConfig) -> SharesService:
    return SharesService(config)
