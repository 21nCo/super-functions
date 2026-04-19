import base64
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Protocol, Set, Tuple

from pydantic import BaseModel

from .. import errors
from ..events import FileFnEventEmitter, create_file_deleted_event
from ..models import FileProviderContext, FileRecord, FileVersionRecord, Visibility
from ..policies import resolve_artifact_storage_target, resolve_storage_target
from ..routed_storage import get_storage_capabilities


class Authorizer(Protocol):
    async def can_read(self, file: FileRecord, ctx: FileProviderContext) -> bool: ...

    async def can_write(self, file: FileRecord, ctx: FileProviderContext) -> bool: ...

    async def can_delete(self, file: FileRecord, ctx: FileProviderContext) -> bool: ...


class DefaultAuthorizer:
    async def can_read(self, file: FileRecord, ctx: FileProviderContext) -> bool:
        if file.visibility == Visibility.PUBLIC:
            return True
        if file.ownerId == ctx.principalId:
            return True
        if file.visibility == Visibility.SHARED and file.tenantId and file.tenantId == ctx.tenantId:
            return True
        return False

    async def can_write(self, file: FileRecord, ctx: FileProviderContext) -> bool:
        return file.ownerId == ctx.principalId

    async def can_delete(self, file: FileRecord, ctx: FileProviderContext) -> bool:
        return file.ownerId == ctx.principalId


class QuotaProvider(Protocol):
    async def record_usage(self, input: Dict[str, Any]) -> None: ...


class FileServiceConfig(BaseModel):
    db: Any
    storage: Any
    policies: Optional[Any] = None
    events: FileFnEventEmitter
    logger: Optional[Any] = None
    quota: Optional[Any] = None
    authorizer: Optional[Any] = None
    namespace: str = "filefn"
    signed_url_ttl_seconds: int = 900

    class Config:
        arbitrary_types_allowed = True


class FileService:
    def __init__(self, config: FileServiceConfig):
        self.db = config.db
        self.storage = config.storage
        self.policies = config.policies
        self.events = config.events
        self.logger = config.logger
        self.quota = config.quota
        self.authorizer = config.authorizer or DefaultAuthorizer()
        self.namespace = config.namespace
        self.signed_url_ttl_seconds = config.signed_url_ttl_seconds

    async def _get_file_record(self, file_id: str) -> FileRecord:
        file_data = await self.db.find_one(
            model="files",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        if not file_data:
            raise errors.not_found("File")
        return FileRecord(**file_data)

    async def _get_bound_version(self, file_id: str, version_id: str) -> FileVersionRecord:
        version_data = await self.db.find_one(
            model="fileVersions",
            where=[{"field": "versionId", "operator": "eq", "value": version_id}],
            namespace=self.namespace,
        )
        if not version_data:
            raise errors.not_found("Version")

        version = FileVersionRecord(**version_data)
        if version.fileId != file_id:
            raise errors.not_found("Version")
        return version

    def _file_storage_target(self, policy_name: Optional[str]) -> str:
        policy = self.policies.get(policy_name) if (self.policies and policy_name) else None
        return resolve_storage_target(policy)

    def _artifact_storage_target(self, policy_name: Optional[str]) -> str:
        policy = self.policies.get(policy_name) if (self.policies and policy_name) else None
        return resolve_artifact_storage_target(policy)

    def _parse_timestamp(self, value: str) -> datetime:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _file_sort_key(self, file: FileRecord) -> Tuple[float, str]:
        timestamp = self._parse_timestamp(file.updatedAt)
        return (-timestamp.timestamp(), file.fileId)

    def _encode_cursor(self, updated_at: str, file_id: str) -> str:
        payload = json.dumps({"updatedAt": updated_at, "fileId": file_id}).encode("utf-8")
        return base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")

    def _parse_cursor(self, cursor: str) -> Optional[Dict[str, str]]:
        padded = cursor + "=" * (-len(cursor) % 4)
        try:
            decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
            parsed = json.loads(decoded)
        except Exception:
            return None
        if isinstance(parsed, dict) and isinstance(parsed.get("updatedAt"), str) and isinstance(parsed.get("fileId"), str):
            return {"updatedAt": parsed["updatedAt"], "fileId": parsed["fileId"]}
        return None

    def _is_after_cursor(self, file: FileRecord, cursor: Dict[str, str]) -> bool:
        file_ts = self._parse_timestamp(file.updatedAt)
        cursor_ts = self._parse_timestamp(cursor["updatedAt"])
        if file_ts < cursor_ts:
            return True
        if file_ts > cursor_ts:
            return False
        return file.fileId > cursor["fileId"]

    def _is_grant_expired(self, expires_at: Optional[str]) -> bool:
        if not expires_at:
            return False
        try:
            return self._parse_timestamp(expires_at) <= datetime.now(timezone.utc)
        except Exception:
            return False

    async def _get_readable_grant_file_ids(self, ctx: FileProviderContext) -> Set[str]:
        if not ctx.principalId:
            return set()

        grants: List[Dict[str, Any]] = []
        grants.extend(
            await self.db.find_many(
                model="filePermissions",
                where=[{"field": "userId", "operator": "eq", "value": ctx.principalId}],
                namespace=self.namespace,
            )
        )
        if ctx.tenantId:
            grants.extend(
                await self.db.find_many(
                    model="filePermissions",
                    where=[{"field": "tenantId", "operator": "eq", "value": ctx.tenantId}],
                    namespace=self.namespace,
                )
            )

        readable: Set[str] = set()
        for grant in grants:
            if not grant.get("canRead"):
                continue
            if self._is_grant_expired(grant.get("expiresAt")):
                continue
            grant_file_id = grant.get("fileId")
            if not isinstance(grant_file_id, str):
                continue
            if grant.get("userId") == ctx.principalId:
                readable.add(grant_file_id)
            elif grant.get("tenantId") and grant.get("tenantId") == ctx.tenantId:
                readable.add(grant_file_id)
        return readable

    @staticmethod
    def _list_order_by() -> List[Dict[str, str]]:
        return [
            {"field": "updatedAt", "direction": "desc"},
            {"field": "fileId", "direction": "asc"},
        ]

    async def _find_files(
        self,
        where: List[Dict[str, Any]],
        *,
        limit: Optional[int] = None,
    ) -> List[FileRecord]:
        rows = await self.db.find_many(
            model="files",
            where=where,
            order_by=self._list_order_by(),
            limit=limit,
            namespace=self.namespace,
        )
        return [FileRecord(**item) for item in rows]

    async def _list_accessible_files_default(
        self,
        ctx: FileProviderContext,
        *,
        source_limit: Optional[int] = None,
    ) -> List[FileRecord]:
        files_by_id: Dict[str, FileRecord] = {}

        for file in await self._find_files(
            [{"field": "visibility", "operator": "eq", "value": Visibility.PUBLIC.value}],
            limit=source_limit,
        ):
            files_by_id[file.fileId] = file

        if ctx.tenantId:
            for file in await self._find_files(
                [
                    {"field": "visibility", "operator": "eq", "value": Visibility.SHARED.value},
                    {"field": "tenantId", "operator": "eq", "value": ctx.tenantId},
                ],
                limit=source_limit,
            ):
                files_by_id[file.fileId] = file

        if ctx.principalId:
            for file in await self._find_files(
                [{"field": "ownerId", "operator": "eq", "value": ctx.principalId}],
                limit=source_limit,
            ):
                files_by_id[file.fileId] = file

            granted_file_ids = await self._get_readable_grant_file_ids(ctx)
            for file_id in granted_file_ids:
                file_data = await self.db.find_one(
                    model="files",
                    where=[{"field": "fileId", "operator": "eq", "value": file_id}],
                    namespace=self.namespace,
                )
                if file_data:
                    files_by_id[file_id] = FileRecord(**file_data)

        return list(files_by_id.values())

    async def _can_read_file(
        self,
        file: FileRecord,
        ctx: FileProviderContext,
        readable_grant_file_ids: Optional[Set[str]] = None,
    ) -> bool:
        if await self.authorizer.can_read(file, ctx):
            return True
        return file.fileId in (readable_grant_file_ids or set())

    def _proxy_part_key(self, storage_key: str, part_number: int) -> str:
        return f"{storage_key}.parts/{part_number}"

    async def get_file(
        self,
        file_id: str,
        ctx: FileProviderContext,
        version_id: Optional[str] = None,
    ) -> Any:
        file = await self._get_file_record(file_id)

        readable_grant_file_ids = await self._get_readable_grant_file_ids(ctx)
        if not await self._can_read_file(file, ctx, readable_grant_file_ids):
            raise errors.forbidden()

        if version_id:
            version = await self._get_bound_version(file_id, version_id)
            payload = file.model_dump()
            payload.update(
                {
                    "currentVersionId": version.versionId,
                    "mimeType": version.mimeType,
                    "size": version.size,
                    "versionId": version.versionId,
                    "versionCreatedAt": version.createdAt,
                    "checksumSha256Base64": version.checksumSha256Base64,
                    "storageKey": version.storageKey,
                }
            )
            return payload

        return file

    async def list_files(
        self,
        ctx: FileProviderContext,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        options = options or {}
        requested = options.get("limit", 20)
        try:
            requested = int(requested)
        except Exception:
            requested = 20
        limit = min(100, max(1, requested))

        if isinstance(self.authorizer, DefaultAuthorizer):
            source_limit = None if options.get("cursor") else (limit + 1)
            accessible_files = await self._list_accessible_files_default(ctx, source_limit=source_limit)
        else:
            all_files_data = await self.db.find_many(
                model="files",
                where=[],
                namespace=self.namespace,
            )
            all_files = [FileRecord(**item) for item in all_files_data]
            granted_file_ids = await self._get_readable_grant_file_ids(ctx)
            accessible_files = []
            for file in all_files:
                if await self._can_read_file(file, ctx, granted_file_ids):
                    accessible_files.append(file)

        accessible_files.sort(key=self._file_sort_key)

        paged_files = accessible_files
        cursor = options.get("cursor")
        if cursor:
            tuple_cursor = self._parse_cursor(cursor)
            if tuple_cursor:
                paged_files = [file for file in accessible_files if self._is_after_cursor(file, tuple_cursor)]
            else:
                anchor = next((file for file in accessible_files if file.fileId == cursor), None)
                if anchor:
                    legacy_cursor = {"updatedAt": anchor.updatedAt, "fileId": anchor.fileId}
                    paged_files = [file for file in accessible_files if self._is_after_cursor(file, legacy_cursor)]

        result_files = paged_files[:limit]
        has_more = len(paged_files) > limit
        next_cursor = None
        if has_more and result_files:
            anchor = result_files[-1]
            next_cursor = self._encode_cursor(anchor.updatedAt, anchor.fileId)

        return {"files": [f.model_dump() for f in result_files], "nextCursor": next_cursor}

    async def get_download_url(
        self,
        file_id: str,
        version_id: Optional[str],
        ctx: FileProviderContext,
    ) -> Dict[str, Any]:
        file = await self.get_file(file_id, ctx)

        target_version_id = version_id or file.currentVersionId
        version = await self._get_bound_version(file_id, target_version_id)
        storage_target = self._file_storage_target(file.policy)

        if hasattr(self.storage, "sign_download_url") and get_storage_capabilities(self.storage, storage_target).get("signedDownloadUrls"):
            try:
                result = await self.storage.sign_download_url(
                    key=version.storageKey,
                    expires_in_seconds=self.signed_url_ttl_seconds,
                    target=storage_target,
                )
                return {"url": result["url"], "headers": result.get("headers")}
            except Exception as exc:
                logger_warning = getattr(self.logger, "warning", None)
                if callable(logger_warning):
                    logger_warning(
                        "signed download url generation failed; falling back to proxy",
                        {
                            "fileId": file_id,
                            "versionId": version.versionId,
                            "storageKey": version.storageKey,
                            "error": str(exc),
                        },
                    )

        proxy_url = (
            f"/proxy/files/{file_id}/versions/{version.versionId}/download"
            if version_id
            else f"/proxy/files/{file_id}/download"
        )
        return {"url": proxy_url}

    async def get_download_stream(
        self,
        file_id: str,
        version_id: Optional[str],
        ctx: FileProviderContext,
    ) -> Dict[str, Any]:
        file = await self.get_file(file_id, ctx)
        target_version_id = version_id or file.currentVersionId
        version = await self._get_bound_version(file_id, target_version_id)
        storage_target = self._file_storage_target(file.policy)

        stream = await self.storage.open_download_stream(key=version.storageKey, target=storage_target)
        return {"stream": stream, "contentType": version.mimeType, "size": version.size}

    async def delete_file(self, file_id: str, ctx: FileProviderContext) -> None:
        file = await self._get_file_record(file_id)

        if not await self.authorizer.can_delete(file, ctx):
            raise errors.forbidden()

        versions_data = await self.db.find_many(
            model="fileVersions",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        versions = [FileVersionRecord(**item) for item in versions_data]

        artifacts = await self.db.find_many(
            model="fileArtifacts",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )

        all_sessions = await self.db.find_many(
            model="uploadSessions",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        pending_sessions = [session for session in all_sessions if session.get("status") != "completed"]

        for session in pending_sessions:
            session_storage_target = self._file_storage_target(session.get("policy"))
            storage_upload_id = session.get("storageUploadId")
            if storage_upload_id and hasattr(self.storage, "abort_multipart_upload"):
                try:
                    await self.storage.abort_multipart_upload(
                        key=session.get("storageKey"),
                        upload_id=storage_upload_id,
                        target=session_storage_target,
                    )
                except Exception:
                    pass

            parts = await self.db.find_many(
                model="uploadParts",
                where=[{"field": "uploadSessionId", "operator": "eq", "value": session.get("uploadSessionId")}],
                namespace=self.namespace,
            )
            if session.get("uploadMode") == "proxy":
                for part in parts:
                    try:
                        await self.storage.delete_object(
                            key=self._proxy_part_key(session.get("storageKey"), part.get("partNumber")),
                            target=session_storage_target,
                        )
                    except Exception:
                        pass

            await self.db.delete_many(
                model="uploadParts",
                where=[{"field": "uploadSessionId", "operator": "eq", "value": session.get("uploadSessionId")}],
                namespace=self.namespace,
            )

        def ref_key(target: str, key: str) -> str:
            return f"{target}\u0000{key}"

        version_bytes_by_storage_key: Dict[str, int] = {}
        candidate_storage_keys: Set[str] = set()
        file_storage_target = self._file_storage_target(file.policy)
        artifact_storage_target = self._artifact_storage_target(file.policy)

        for version in versions:
            key = ref_key(file_storage_target, version.storageKey)
            version_bytes_by_storage_key[key] = max(
                version_bytes_by_storage_key.get(key, 0),
                version.size,
            )
            candidate_storage_keys.add(key)

        for artifact in artifacts:
            storage_key = artifact.get("storageKey")
            if storage_key:
                candidate_storage_keys.add(ref_key(artifact_storage_target, storage_key))

        storage_keys_referenced_elsewhere: Set[str] = set()
        if candidate_storage_keys:
            all_versions = await self.db.find_many(
                model="fileVersions",
                where=[],
                namespace=self.namespace,
            )
            all_files = await self.db.find_many(
                model="files",
                where=[],
                namespace=self.namespace,
            )
            policy_by_file_id = {row.get("fileId"): row.get("policy") for row in all_files}
            for version in all_versions:
                version_target = self._file_storage_target(policy_by_file_id.get(version.get("fileId")))
                candidate = ref_key(version_target, version.get("storageKey"))
                if version.get("fileId") != file_id and candidate in candidate_storage_keys:
                    storage_keys_referenced_elsewhere.add(candidate)

            all_artifacts = await self.db.find_many(
                model="fileArtifacts",
                where=[],
                namespace=self.namespace,
            )
            for artifact in all_artifacts:
                artifact_target = self._artifact_storage_target(policy_by_file_id.get(artifact.get("fileId")))
                candidate = ref_key(artifact_target, artifact.get("storageKey"))
                if artifact.get("fileId") != file_id and candidate in candidate_storage_keys:
                    storage_keys_referenced_elsewhere.add(candidate)

        await self.db.delete_many(
            model="filePermissions",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        await self.db.delete_many(
            model="fileShares",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        await self.db.delete_many(
            model="fileArtifacts",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        await self.db.delete_many(
            model="fileVersions",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        for session in all_sessions:
            await self.db.delete(
                model="uploadSessions",
                where=[{"field": "uploadSessionId", "operator": "eq", "value": session.get("uploadSessionId")}],
                namespace=self.namespace,
            )
        await self.db.delete(
            model="files",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )

        total_bytes_freed = 0
        for storage_ref in candidate_storage_keys:
            if storage_ref in storage_keys_referenced_elsewhere:
                continue
            try:
                target, storage_key = storage_ref.split("\u0000", 1)
                await self.storage.delete_object(key=storage_key, target=target)
                total_bytes_freed += version_bytes_by_storage_key.get(storage_ref, 0)
            except Exception:
                pass

        if self.quota and total_bytes_freed > 0:
            await self.quota.record_usage(
                {
                    "principalId": file.ownerId,
                    "tenantId": file.tenantId,
                    "bytes": -total_bytes_freed,
                }
            )

        self.events.emit(
            "file:deleted",
            create_file_deleted_event(
                {"fileId": file_id, "ownerId": file.ownerId, "tenantId": file.tenantId},
                ctx.requestId,
            ),
        )

        if self.logger:
            self.logger.info(
                "File deleted",
                {
                    "fileId": file_id,
                    "ownerId": file.ownerId,
                    "tenantId": file.tenantId,
                    "requestId": ctx.requestId,
                },
            )

    async def list_versions(self, file_id: str, ctx: FileProviderContext) -> Dict[str, Any]:
        await self.get_file(file_id, ctx)
        versions_data = await self.db.find_many(
            model="fileVersions",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            order_by=[{"field": "createdAt", "direction": "desc"}],
            namespace=self.namespace,
        )
        return {"versions": versions_data}

    async def can_write_file(self, file_id: str, ctx: FileProviderContext) -> bool:
        file_data = await self.db.find_one(
            model="files",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )

        if not file_data:
            return True

        file = FileRecord(**file_data)
        return await self.authorizer.can_write(file, ctx)

    async def get_version(self, file_id: str, version_id: str, ctx: FileProviderContext) -> FileVersionRecord:
        await self.get_file(file_id, ctx)
        return await self._get_bound_version(file_id, version_id)


def create_file_service(config: FileServiceConfig) -> FileService:
    return FileService(config)
