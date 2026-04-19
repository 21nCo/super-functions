import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from tempfile import SpooledTemporaryFile
from typing import Any, Dict, List, Optional, Protocol, cast

from pydantic import BaseModel

from .. import errors
from ..events import (
    FileFnEventEmitter,
    create_file_uploaded_event,
    create_part_recorded_event,
    create_upload_started_event,
)
from ..models import FileProviderContext, UploadSessionRecord
from ..policies import (
    PolicyStoragePathContext,
    compute_storage_path,
    matches_content_type,
    resolve_storage_target,
)
from ..routed_storage import get_storage_capabilities


class QuotaProvider(Protocol):
    async def check_quota(self, input: Dict[str, Any]) -> Dict[str, Any]: ...

    async def record_usage(self, input: Dict[str, Any]) -> None: ...


class FileWriteAuthChecker(Protocol):
    async def can_write_file(self, file_id: str, ctx: FileProviderContext) -> bool: ...


class ProcessingService(Protocol):
    async def trigger_processing(self, input: Dict[str, Any], ctx: FileProviderContext) -> Dict[str, Any]: ...


class UploadSessionServiceConfig(BaseModel):
    db: Any
    storage: Any
    policies: Any
    events: FileFnEventEmitter
    logger: Optional[Any] = None
    quota: Optional[Any] = None
    dedup: Optional[Any] = None
    file_write_checker: Optional[Any] = None
    processing_service: Optional[Any] = None
    namespace: str = "filefn"
    allow_anonymous_uploads: bool = True
    default_chunk_size_bytes: int = 8 * 1024 * 1024
    upload_session_ttl_seconds: int = 86400
    signed_url_ttl_seconds: int = 900

    class Config:
        arbitrary_types_allowed = True


class CreateSessionInput(BaseModel):
    policy: str
    fileName: str
    size: int
    mimeType: str
    fileId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    idempotencyKey: Optional[str] = None


class UploadSessionService:
    def __init__(self, config: UploadSessionServiceConfig):
        self.db = config.db
        self.storage = config.storage
        self.policies = config.policies
        self.events = config.events
        self.logger = config.logger
        self.quota = config.quota
        self.dedup = config.dedup
        self.file_write_checker = config.file_write_checker
        self.processing_service = config.processing_service
        self.namespace = config.namespace
        self.allow_anonymous_uploads = config.allow_anonymous_uploads
        self.default_chunk_size_bytes = config.default_chunk_size_bytes
        self.upload_session_ttl_seconds = config.upload_session_ttl_seconds
        self.signed_url_ttl_seconds = config.signed_url_ttl_seconds

    def _generate_id(self) -> str:
        return f"upl_{secrets.token_urlsafe(16)}"

    def _hash_payload(self, input: CreateSessionInput, ctx: FileProviderContext) -> str:
        payload = {
            "p": input.policy,
            "fn": input.fileName,
            "s": input.size,
            "mt": input.mimeType,
            "fid": input.fileId,
            "md": input.metadata,
            "pr": ctx.principalId,
            "tn": ctx.tenantId,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()

    def _hash_session_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    async def _issue_anonymous_session_token(self, upload_session_id: str) -> str:
        upload_session_token = secrets.token_urlsafe(32)
        await self.db.update(
            model="uploadSessions",
            where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
            data={
                "uploadSessionToken": None,
                "sessionTokenHash": self._hash_session_token(upload_session_token),
            },
            namespace=self.namespace,
        )
        return upload_session_token

    def _extract_upload_session_token(self, ctx: Any) -> Optional[str]:
        for attr in ("uploadSessionToken", "upload_session_token", "sessionToken", "session_token"):
            value = getattr(ctx, attr, None)
            if isinstance(value, str) and value:
                return value

        headers = getattr(ctx, "headers", None)
        if isinstance(headers, dict):
            for key in ("x-upload-session-token", "X-Upload-Session-Token", "x_upload_session_token"):
                value = headers.get(key)
                if isinstance(value, str) and value:
                    return value

        return None

    def _as_utc(self, value: str) -> datetime:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    def _is_expired(self, expires_at: str) -> bool:
        return self._as_utc(expires_at) <= datetime.now(timezone.utc)

    def _assert_session_binding(self, session_data: Dict[str, Any], ctx: Any) -> None:
        owner_id = session_data.get("ownerId")
        tenant_id = session_data.get("tenantId")

        if owner_id and owner_id != "anonymous":
            if getattr(ctx, "principalId", None) != owner_id:
                raise errors.forbidden({"uploadSessionId": session_data.get("uploadSessionId")})
            if tenant_id != getattr(ctx, "tenantId", None):
                raise errors.forbidden({"uploadSessionId": session_data.get("uploadSessionId")})
            return

        provided_token = self._extract_upload_session_token(ctx)
        if not provided_token:
            raise errors.FileFnError(
                code="FILEFN_SESSION_TOKEN_REQUIRED",
                message="Upload session token required",
                status=401,
                details={"uploadSessionId": session_data.get("uploadSessionId")},
            )

        expected_hash = session_data.get("sessionTokenHash")
        if not expected_hash or self._hash_session_token(provided_token) != expected_hash:
            raise errors.FileFnError(
                code="FILEFN_SESSION_TOKEN_INVALID",
                message="Invalid upload session token",
                status=403,
                details={"uploadSessionId": session_data.get("uploadSessionId")},
            )

    def _proxy_part_key(self, session: UploadSessionRecord, part_number: int) -> str:
        return f"{session.storageKey}.parts/{part_number}"

    def _select_upload_mode(self, storage_target: Optional[str] = None) -> str:
        capabilities = get_storage_capabilities(self.storage, storage_target)

        supports_multipart = bool(capabilities.get("signedUploadUrls") and capabilities.get("multipart"))
        supports_proxy = bool(capabilities.get("proxyStreamingUpload"))

        if not capabilities:
            supports_multipart = all(
                hasattr(self.storage, name)
                for name in (
                    "create_multipart_upload",
                    "sign_multipart_upload_part_url",
                    "complete_multipart_upload",
                )
            )
            supports_proxy = hasattr(self.storage, "put_object") and hasattr(
                self.storage, "open_download_stream"
            )

        if supports_multipart:
            return "multipart-signed-url"
        if supports_proxy:
            return "proxy"

        raise errors.no_supported_upload_mode()

    async def _get_session_data(self, upload_session_id: str) -> Dict[str, Any]:
        session_data = await self.db.find_one(
            model="uploadSessions",
            where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
            namespace=self.namespace,
        )
        if not session_data:
            raise errors.session_not_found()
        return cast(Dict[str, Any], session_data)

    async def create_session(self, input: CreateSessionInput, ctx: FileProviderContext) -> Dict[str, Any]:
        warnings: List[str] = []

        if not ctx.principalId and not self.allow_anonymous_uploads:
            raise errors.auth_required()

        if input.idempotencyKey:
            existing_data = await self.db.find_one(
                model="uploadSessions",
                where=[{"field": "idempotencyKey", "operator": "eq", "value": input.idempotencyKey}],
                namespace=self.namespace,
            )
            if existing_data:
                existing = UploadSessionRecord(**existing_data)
                expected_hash = self._hash_payload(input, ctx)
                if existing.idempotencyPayloadHash != expected_hash:
                    raise errors.idempotency_conflict()

                result: Dict[str, Any] = {
                    "uploadSessionId": existing.uploadSessionId,
                    "fileId": existing.fileId,
                    "uploadMode": existing.uploadMode,
                    "chunkSizeBytes": existing.chunkSizeBytes,
                    "totalParts": existing.totalParts,
                    "expiresAt": existing.expiresAt,
                    "warnings": [],
                }
                if existing.ownerId == "anonymous":
                    issued_upload_session_token = await self._issue_anonymous_session_token(
                        existing.uploadSessionId,
                    )
                    result["uploadSessionToken"] = issued_upload_session_token
                return result

        policy = self.policies.get(input.policy)
        if not policy:
            raise errors.policy_not_found(input.policy)

        if policy.contentTypes and not any(matches_content_type(pattern, input.mimeType) for pattern in policy.contentTypes):
            raise errors.policy_content_type_not_allowed(input.policy, input.mimeType)
        if policy.maxSizeBytes is not None and input.size > policy.maxSizeBytes:
            raise errors.policy_max_size_exceeded(input.policy, policy.maxSizeBytes, input.size)

        if input.fileId and self.file_write_checker:
            if not await self.file_write_checker.can_write_file(input.fileId, ctx):
                raise errors.forbidden({"fileId": input.fileId, "operation": "replace"})

        if self.quota:
            quota_result = await self.quota.check_quota(
                {
                    "principalId": ctx.principalId,
                    "tenantId": ctx.tenantId,
                    "requestedBytes": input.size,
                }
            )
            if not quota_result.get("allowed"):
                raise errors.quota_exceeded(
                    quota_result.get("current", 0),
                    quota_result.get("limit", 0),
                    input.size,
                )
            warning = quota_result.get("warning")
            if warning:
                warnings.append(warning)

        storage_target = resolve_storage_target(policy)
        upload_mode = self._select_upload_mode(storage_target)
        chunk_size_bytes = self.default_chunk_size_bytes
        total_parts = max(1, (input.size + chunk_size_bytes - 1) // chunk_size_bytes)

        upload_session_id = self._generate_id()
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=self.upload_session_ttl_seconds)).isoformat()

        file_id = input.fileId or f"file_{secrets.token_urlsafe(12)}"
        version_id = f"ver_{secrets.token_urlsafe(12)}"

        storage_ctx = PolicyStoragePathContext(
            fileName=input.fileName,
            principalId=ctx.principalId,
            tenantId=ctx.tenantId,
            fileId=file_id,
            versionId=version_id,
        )
        storage_key = compute_storage_path(policy, storage_ctx)

        storage_upload_id: Optional[str] = None
        if upload_mode == "multipart-signed-url":
            storage_upload_id = cast(
                str,
                await self.storage.create_multipart_upload(
                key=storage_key,
                metadata={"contentType": input.mimeType},
                content_type=input.mimeType,
                target=storage_target,
                ),
            )

        upload_session_token: Optional[str] = None
        session_token_hash: Optional[str] = None
        owner_id = ctx.principalId or "anonymous"
        if owner_id == "anonymous":
            upload_session_token = secrets.token_urlsafe(32)
            session_token_hash = self._hash_session_token(upload_session_token)

        await self.db.create(
            model="uploadSessions",
            data={
                "uploadSessionId": upload_session_id,
                "status": "pending",
                "policy": input.policy,
                "fileId": file_id,
                "fileName": input.fileName,
                "mimeType": input.mimeType,
                "size": input.size,
                "uploadMode": upload_mode,
                "chunkSizeBytes": chunk_size_bytes,
                "totalParts": total_parts,
                "storageKey": storage_key,
                "storageUploadId": storage_upload_id,
                "ownerId": owner_id,
                "tenantId": ctx.tenantId,
                "metadata": input.metadata or {},
                "idempotencyKey": input.idempotencyKey,
                "idempotencyPayloadHash": self._hash_payload(input, ctx) if input.idempotencyKey else None,
                "uploadSessionToken": None,
                "sessionTokenHash": session_token_hash,
                "expiresAt": expires_at,
                "createdAt": now.isoformat(),
            },
            namespace=self.namespace,
        )

        self.events.emit(
            "upload.started",
            create_upload_started_event(
                {
                    "uploadSessionId": upload_session_id,
                    "fileName": input.fileName,
                    "size": input.size,
                    "mimeType": input.mimeType,
                    "policy": input.policy,
                    "principalId": ctx.principalId,
                    "tenantId": ctx.tenantId,
                },
                ctx.requestId,
            ),
        )

        session_result: Dict[str, Any] = {
            "uploadSessionId": upload_session_id,
            "fileId": file_id,
            "uploadMode": upload_mode,
            "chunkSizeBytes": chunk_size_bytes,
            "totalParts": total_parts,
            "expiresAt": expires_at,
            "warnings": warnings,
        }
        if upload_session_token:
            session_result["uploadSessionToken"] = upload_session_token
        return session_result

    async def get_session_status(self, upload_session_id: str, ctx: Any) -> Dict[str, Any]:
        session_data = await self._get_session_data(upload_session_id)
        self._assert_session_binding(session_data, ctx)

        session = UploadSessionRecord(**session_data)
        if self._is_expired(session.expiresAt):
            raise errors.upload_expired()

        parts_data = await self.db.find_many(
            model="uploadParts",
            where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
            namespace=self.namespace,
        )
        recorded_parts = sorted(part["partNumber"] for part in parts_data)

        return {
            "uploadSessionId": upload_session_id,
            "fileId": session.fileId,
            "status": session.status,
            "totalParts": session.totalParts,
            "recordedParts": recorded_parts,
            "chunkSizeBytes": session.chunkSizeBytes,
            "fileSize": session.size,
            "expiresAt": session.expiresAt,
        }

    async def sign_part(
        self,
        upload_session_id: str,
        part_number: int,
        content_length: int,
        ctx: Any,
    ) -> Dict[str, Any]:
        session_data = await self._get_session_data(upload_session_id)
        self._assert_session_binding(session_data, ctx)

        session = UploadSessionRecord(**session_data)
        if session.status == "aborted":
            raise errors.upload_aborted()
        if session.status == "completed":
            raise errors.upload_already_completed()
        if self._is_expired(session.expiresAt):
            raise errors.upload_expired()

        if part_number < 1 or part_number > session.totalParts:
            raise errors.invalid_part_number()

        if session.uploadMode == "proxy":
            return {
                "url": f"/upload/{upload_session_id}/parts/{part_number}",
                "headers": {"content-type": session.mimeType},
                "expiresAt": session.expiresAt,
            }

        policy = self.policies.get(session.policy)
        storage_target = resolve_storage_target(policy)
        result = cast(
            Dict[str, Any],
            await self.storage.sign_multipart_upload_part_url(
            key=session.storageKey,
            upload_id=session.storageUploadId,
            part_number=part_number,
            expires_in_seconds=self.signed_url_ttl_seconds,
            constraints={"contentLength": content_length},
            target=storage_target,
            ),
        )

        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=self.signed_url_ttl_seconds)).isoformat()
        return {
            "url": result["url"],
            "headers": result.get("headers"),
            "expiresAt": expires_at,
        }

    async def complete_part(
        self,
        upload_session_id: str,
        part_number: int,
        etag: str,
        size: int,
        ctx: Any,
    ) -> Dict[str, Any]:
        session_data = await self._get_session_data(upload_session_id)
        self._assert_session_binding(session_data, ctx)

        session = UploadSessionRecord(**session_data)
        if session.status == "aborted":
            raise errors.upload_aborted()
        if session.status == "completed":
            raise errors.upload_already_completed()
        if self._is_expired(session.expiresAt):
            raise errors.upload_expired()
        if part_number < 1 or part_number > session.totalParts:
            raise errors.invalid_part_number()

        existing = await self.db.find_one(
            model="uploadParts",
            where=[
                {"field": "uploadSessionId", "operator": "eq", "value": upload_session_id},
                {"field": "partNumber", "operator": "eq", "value": part_number},
            ],
            namespace=self.namespace,
        )

        if existing:
            if existing.get("etag") == etag and existing.get("size") == size:
                return {"recorded": True}
            raise errors.part_conflict(upload_session_id, part_number)

        await self.db.create(
            model="uploadParts",
            data={
                "uploadSessionId": upload_session_id,
                "partNumber": part_number,
                "etag": etag,
                "size": size,
            },
            namespace=self.namespace,
        )

        if session.status == "pending":
            await self.db.update(
                model="uploadSessions",
                where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
                data={"status": "in_progress"},
                namespace=self.namespace,
            )

        self.events.emit(
            "part.recorded",
            create_part_recorded_event(
                {"uploadSessionId": upload_session_id, "partNumber": part_number, "size": size},
                getattr(ctx, "requestId", None),
            ),
        )
        return {"recorded": True}

    async def record_proxy_part(
        self,
        upload_session_id: str,
        part_number: int,
        data: bytes,
        ctx: Any,
    ) -> Dict[str, Any]:
        session_data = await self._get_session_data(upload_session_id)
        self._assert_session_binding(session_data, ctx)
        session = UploadSessionRecord(**session_data)

        if session.uploadMode != "proxy":
            raise errors.no_supported_upload_mode()

        etag = hashlib.md5(data).hexdigest()
        if session.status == "aborted":
            raise errors.upload_aborted()
        if session.status == "completed":
            raise errors.upload_already_completed()
        if self._is_expired(session.expiresAt):
            raise errors.upload_expired()
        if part_number < 1 or part_number > session.totalParts:
            raise errors.invalid_part_number()

        existing = await self.db.find_one(
            model="uploadParts",
            where=[
                {"field": "uploadSessionId", "operator": "eq", "value": upload_session_id},
                {"field": "partNumber", "operator": "eq", "value": part_number},
            ],
            namespace=self.namespace,
        )
        if existing:
            if existing.get("etag") == etag and existing.get("size") == len(data):
                return {"etag": etag, "size": len(data), "recorded": True}
            raise errors.part_conflict(upload_session_id, part_number)

        part_key = self._proxy_part_key(session, part_number)
        policy = self.policies.get(session.policy)
        storage_target = resolve_storage_target(policy)
        await self.storage.put_object(
            key=part_key,
            data=data,
            metadata={"contentType": session.mimeType},
            target=storage_target,
        )
        await self.complete_part(upload_session_id, part_number, etag, len(data), ctx)

        return {"etag": etag, "size": len(data), "recorded": True}

    async def _finalize_proxy_upload(self, session: UploadSessionRecord, parts: List[Dict[str, Any]]) -> None:
        policy = self.policies.get(session.policy)
        storage_target = resolve_storage_target(policy)
        sorted_parts = sorted(parts, key=lambda p: p["partNumber"])
        with SpooledTemporaryFile(max_size=8 * 1024 * 1024) as payload:
            for part in sorted_parts:
                part_key = self._proxy_part_key(session, part["partNumber"])
                stream = await self.storage.open_download_stream(key=part_key, target=storage_target)
                async for chunk in stream:
                    payload.write(chunk)

            payload.seek(0)
            await self.storage.put_object(
                key=session.storageKey,
                data=payload,
                metadata={"contentType": session.mimeType},
                target=storage_target,
            )

        for part in sorted_parts:
            part_key = self._proxy_part_key(session, part["partNumber"])
            try:
                await self.storage.delete_object(key=part_key, target=storage_target)
            except Exception:
                pass

    async def complete_session(self, upload_session_id: str, ctx: Any) -> Dict[str, str]:
        session_data = await self._get_session_data(upload_session_id)
        self._assert_session_binding(session_data, ctx)
        session = UploadSessionRecord(**session_data)

        if session.status == "completed":
            completed_file_id = session.fileId or ""
            completion_version_id = cast(
                str,
                session_data.get("completionVersionId") or session_data.get("versionId") or "",
            )
            return {
                "fileId": completed_file_id,
                "versionId": completion_version_id,
            }

        if self._is_expired(session.expiresAt):
            raise errors.upload_expired()

        if session.fileId and self.file_write_checker:
            if not await self.file_write_checker.can_write_file(session.fileId, ctx):
                raise errors.forbidden({"fileId": session.fileId, "operation": "replace"})

        parts_data = await self.db.find_many(
            model="uploadParts",
            where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
            namespace=self.namespace,
        )
        if len(parts_data) != session.totalParts:
            raise errors.upload_incomplete()
        uploaded_size = sum(int(part.get("size") or 0) for part in parts_data)
        if uploaded_size != session.size:
            raise errors.upload_size_mismatch(session.size, uploaded_size)

        policy = self.policies.get(session.policy)
        storage_target = resolve_storage_target(policy)

        if session.uploadMode == "multipart-signed-url":
            parts = sorted(parts_data, key=lambda p: p["partNumber"])
            await self.storage.complete_multipart_upload(
                key=session.storageKey,
                upload_id=session.storageUploadId,
                parts=[{"partNumber": p["partNumber"], "etag": p["etag"]} for p in parts],
                target=storage_target,
            )
        elif session.uploadMode == "proxy":
            await self._finalize_proxy_upload(session, parts_data)

        now_str = datetime.now(timezone.utc).isoformat()
        file_id = session.fileId or f"file_{secrets.token_urlsafe(12)}"
        version_id = f"ver_{secrets.token_urlsafe(12)}"
        metadata = session_data.get("metadata") or {}

        final_storage_key = session.storageKey
        checksum_sha256_base64: Optional[str] = None
        if self.dedup and self.dedup.is_enabled():
            dedup_res = await self.dedup.compute_and_check_duplicate(
                session.storageKey,
                session.tenantId,
                storage_target,
                self.storage,
            )
            checksum_sha256_base64 = dedup_res.checksumSha256Base64
            if dedup_res.isDuplicate and dedup_res.existingStorageKey:
                final_storage_key = dedup_res.existingStorageKey
                if final_storage_key != session.storageKey:
                    try:
                        await self.storage.delete_object(key=session.storageKey, target=storage_target)
                    except Exception:
                        pass

        existing_file = await self.db.find_one(
            model="files",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )

        if existing_file:
            await self.db.update(
                model="files",
                where=[{"field": "fileId", "operator": "eq", "value": file_id}],
                data={
                    "currentVersionId": version_id,
                    "size": session.size,
                    "mimeType": session.mimeType,
                    "metadata": metadata,
                    "updatedAt": now_str,
                },
                namespace=self.namespace,
            )
        else:
            await self.db.create(
                model="files",
                data={
                    "fileId": file_id,
                    "currentVersionId": version_id,
                    "ownerId": session.ownerId,
                    "tenantId": session.tenantId,
                    "visibility": getattr(policy, "visibility", "private"),
                    "policy": session.policy,
                    "mimeType": session.mimeType,
                    "size": session.size,
                    "name": session.fileName,
                    "metadata": metadata,
                    "createdAt": now_str,
                    "updatedAt": now_str,
                },
                namespace=self.namespace,
            )

        await self.db.create(
            model="fileVersions",
            data={
                "versionId": version_id,
                "fileId": file_id,
                "storageKey": final_storage_key,
                "mimeType": session.mimeType,
                "size": session.size,
                "checksumSha256Base64": checksum_sha256_base64,
                "tenantId": session.tenantId,
                "createdAt": now_str,
            },
            namespace=self.namespace,
        )

        await self.db.update(
            model="uploadSessions",
            where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
            data={
                "status": "completed",
                "fileId": file_id,
                "completionVersionId": version_id,
            },
            namespace=self.namespace,
        )

        if self.quota:
            await self.quota.record_usage(
                {
                    "principalId": getattr(ctx, "principalId", None),
                    "tenantId": getattr(ctx, "tenantId", None),
                    "bytes": session.size,
                }
            )

        self.events.emit(
            "file:uploaded",
            create_file_uploaded_event(
                {
                    "fileId": file_id,
                    "versionId": version_id,
                    "fileName": session.fileName,
                    "size": session.size,
                    "mimeType": session.mimeType,
                    "ownerId": session.ownerId,
                    "tenantId": session.tenantId,
                },
                getattr(ctx, "requestId", None),
            ),
        )

        if self.processing_service:
            await self.processing_service.trigger_processing(
                {
                    "fileId": file_id,
                    "versionId": version_id,
                    "storageKey": final_storage_key,
                    "mimeType": session.mimeType,
                    "size": session.size,
                    "fileName": session.fileName,
                    "tenantId": session.tenantId,
                },
                ctx,
            )

        return {"fileId": file_id, "versionId": version_id}

    async def abort_session(self, upload_session_id: str, ctx: Any) -> None:
        session_data = await self._get_session_data(upload_session_id)
        self._assert_session_binding(session_data, ctx)
        session = UploadSessionRecord(**session_data)

        if session.status == "completed":
            raise errors.upload_already_completed()

        policy = self.policies.get(session.policy)
        storage_target = resolve_storage_target(policy)

        if session.storageUploadId:
            try:
                await self.storage.abort_multipart_upload(
                    key=session.storageKey,
                    upload_id=session.storageUploadId,
                    target=storage_target,
                )
            except Exception:
                pass

        parts_data = await self.db.find_many(
            model="uploadParts",
            where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
            namespace=self.namespace,
        )
        for part in parts_data:
            part_key = self._proxy_part_key(session, part["partNumber"])
            try:
                await self.storage.delete_object(key=part_key, target=storage_target)
            except Exception:
                pass

        await self.db.update(
            model="uploadSessions",
            where=[{"field": "uploadSessionId", "operator": "eq", "value": upload_session_id}],
            data={"status": "aborted"},
            namespace=self.namespace,
        )

    async def garbage_collect_expired_sessions(self) -> Dict[str, int]:
        now = datetime.now(timezone.utc)
        sessions: List[Dict[str, Any]] = []
        seen_session_ids: set[str] = set()
        for status in ("pending", "in_progress", "aborted", "expired"):
            status_rows = await self.db.find_many(
                model="uploadSessions",
                where=[{"field": "status", "operator": "eq", "value": status}],
                namespace=self.namespace,
            )
            for row in status_rows:
                upload_session_id = row.get("uploadSessionId")
                if not upload_session_id or upload_session_id in seen_session_ids:
                    continue
                seen_session_ids.add(upload_session_id)
                sessions.append(row)

        completed_sessions = await self.db.find_many(
            model="uploadSessions",
            where=[{"field": "status", "operator": "eq", "value": "completed"}],
            namespace=self.namespace,
        )

        deleted_sessions = 0
        preserved_completed_sessions = len(completed_sessions)

        for session_data in sessions:
            expires_at_raw = session_data.get("expiresAt")
            if not expires_at_raw:
                continue

            expires_at = self._as_utc(expires_at_raw)
            if expires_at > now:
                continue

            session = UploadSessionRecord(**session_data)
            policy = self.policies.get(session.policy)
            storage_target = resolve_storage_target(policy)

            if session.storageUploadId:
                try:
                    await self.storage.abort_multipart_upload(
                        key=session.storageKey,
                        upload_id=session.storageUploadId,
                        target=storage_target,
                    )
                except Exception:
                    pass

            parts = await self.db.find_many(
                model="uploadParts",
                where=[{"field": "uploadSessionId", "operator": "eq", "value": session.uploadSessionId}],
                namespace=self.namespace,
            )
            for part in parts:
                part_key = self._proxy_part_key(session, part["partNumber"])
                try:
                    await self.storage.delete_object(key=part_key, target=storage_target)
                except Exception:
                    pass

            await self.db.delete_many(
                model="uploadParts",
                where=[{"field": "uploadSessionId", "operator": "eq", "value": session.uploadSessionId}],
                namespace=self.namespace,
            )
            await self.db.delete(
                model="uploadSessions",
                where=[{"field": "uploadSessionId", "operator": "eq", "value": session.uploadSessionId}],
                namespace=self.namespace,
            )
            deleted_sessions += 1

        return {
            "deletedSessions": deleted_sessions,
            "preservedCompletedSessions": preserved_completed_sessions,
        }


def create_upload_session_service(config: UploadSessionServiceConfig) -> UploadSessionService:
    return UploadSessionService(config)
