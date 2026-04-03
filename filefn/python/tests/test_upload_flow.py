from __future__ import annotations

from datetime import datetime, timedelta, timezone
import base64
import hashlib
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from filefn.server import create_event_emitter
from filefn.server import create_routed_storage_adapter
from filefn.server.policies import Policy, create_nucleus_policies, create_policy_registry
from filefn.server.upload_sessions.service import (
    CreateSessionInput,
    UploadSessionService,
    UploadSessionServiceConfig,
    create_upload_session_service,
)


class FakeDB:
    def __init__(self) -> None:
        self.tables: Dict[str, List[Dict[str, Any]]] = {}

    def _table(self, model: str) -> List[Dict[str, Any]]:
        return self.tables.setdefault(model, [])

    @staticmethod
    def _matches(row: Dict[str, Any], where: Optional[List[Dict[str, Any]]]) -> bool:
        if not where:
            return True
        for clause in where:
            if clause.get("operator") != "eq":
                raise ValueError("FakeDB supports only eq operator")
            if row.get(clause["field"]) != clause.get("value"):
                return False
        return True

    async def create(self, model: str, data: Dict[str, Any], namespace: Optional[str] = None) -> Dict[str, Any]:
        row = dict(data)
        self._table(model).append(row)
        return dict(row)

    async def find_one(
        self,
        model: str,
        where: Optional[List[Dict[str, Any]]] = None,
        namespace: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        for row in self._table(model):
            if self._matches(row, where):
                return dict(row)
        return None

    async def find_many(
        self,
        model: str,
        where: Optional[List[Dict[str, Any]]] = None,
        order_by: Optional[List[Dict[str, Any]]] = None,
        limit: Optional[int] = None,
        namespace: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        rows = [dict(row) for row in self._table(model) if self._matches(row, where)]

        if order_by:
            for order in reversed(order_by):
                reverse = order.get("direction", "asc") == "desc"
                rows.sort(key=lambda item: item.get(order["field"]), reverse=reverse)

        if limit is not None:
            rows = rows[:limit]
        return rows

    async def update(
        self,
        model: str,
        where: List[Dict[str, Any]],
        data: Dict[str, Any],
        namespace: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        for row in self._table(model):
            if self._matches(row, where):
                row.update(data)
                return dict(row)
        return None

    async def delete(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        rows = self._table(model)
        for idx, row in enumerate(rows):
            if self._matches(row, where):
                removed = rows.pop(idx)
                return dict(removed)
        return None

    async def delete_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: Optional[str] = None,
    ) -> int:
        rows = self._table(model)
        before = len(rows)
        self.tables[model] = [row for row in rows if not self._matches(row, where)]
        return before - len(self.tables[model])


class FakeStorage:
    def __init__(self, capabilities: Optional[Dict[str, bool]] = None) -> None:
        self.capabilities = capabilities or {}
        self.objects: Dict[str, bytes] = {}
        self.multipart: Dict[str, Dict[str, Any]] = {}
        self.aborted_uploads: List[str] = []
        self.calls: List[str] = []
        self.name = "fake"

    @staticmethod
    def _coerce_bytes(data: Any) -> bytes:
        if isinstance(data, bytes):
            return data
        if hasattr(data, "read"):
            payload = data.read()
            if isinstance(payload, bytes):
                return payload
        return bytes(data)

    async def get_object(self, key: str, target: Optional[str] = None) -> Dict[str, Any]:
        data = self.objects[key]
        return {
            "key": key,
            "size": len(data),
            "etag": "etag",
            "lastModified": datetime.now(timezone.utc).isoformat(),
            "metadata": {},
        }

    async def put_object(
        self,
        key: str,
        data: Any,
        metadata: Optional[Dict[str, str]] = None,
        target: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = self._coerce_bytes(data)
        self.objects[key] = payload
        if target:
            self.calls.append(f"{self.name}:put:{target}:{key}")
        return {
            "key": key,
            "size": len(payload),
            "etag": f"etag-{len(payload)}",
            "lastModified": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
        }

    async def delete_object(self, key: str, target: Optional[str] = None) -> None:
        self.objects.pop(key, None)
        if target:
            self.calls.append(f"{self.name}:delete:{target}:{key}")

    async def open_download_stream(self, key: str, target: Optional[str] = None):
        payload = self.objects.get(key, b"")
        if target:
            self.calls.append(f"{self.name}:download:{target}:{key}")

        async def _gen():
            yield payload

        return _gen()

    async def sign_download_url(self, key: str, expires_in_seconds: int, target: Optional[str] = None) -> Dict[str, Any]:
        return {"url": f"https://download.local/{key}", "headers": {}}

    async def create_multipart_upload(
        self,
        key: str,
        metadata: Optional[Dict[str, str]] = None,
        content_type: Optional[str] = None,
        target: Optional[str] = None,
    ) -> str:
        upload_id = f"mp-{len(self.multipart) + 1}"
        self.multipart[upload_id] = {"key": key, "parts": {}}
        self.calls.append(f"{self.name}:multipart:{target or 'default'}:{key}")
        return upload_id

    async def sign_multipart_upload_part_url(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        expires_in_seconds: int,
        constraints: Optional[Dict[str, Any]] = None,
        target: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {"url": f"https://upload.local/{upload_id}/{part_number}", "headers": {}}

    async def upload_part(
        self,
        key: str,
        upload_id: str,
        part_number: int,
        data: bytes,
        target: Optional[str] = None,
    ) -> str:
        self.multipart.setdefault(upload_id, {"key": key, "parts": {}})["parts"][part_number] = bytes(data)
        return f"etag-{part_number}"

    async def complete_multipart_upload(
        self,
        key: str,
        upload_id: str,
        parts: list[Dict[str, Any]],
        target: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.objects[key] = self.objects.get(key, b"")
        if target:
            self.calls.append(f"{self.name}:complete:{target}:{key}")
        return {
            "key": key,
            "size": len(self.objects[key]),
            "etag": "etag-final",
            "lastModified": datetime.now(timezone.utc).isoformat(),
            "metadata": {},
        }

    async def abort_multipart_upload(self, key: str, upload_id: str, target: Optional[str] = None) -> None:
        self.aborted_uploads.append(upload_id)


class FakeDedup:
    def __init__(self, db: FakeDB, enabled: bool) -> None:
        self.db = db
        self.enabled = enabled

    def is_enabled(self) -> bool:
        return self.enabled

    async def compute_and_check_duplicate(
        self,
        storage_key: str,
        tenant_id: Optional[str],
        storage_target: Optional[str],
        storage: FakeStorage,
    ):
        if not self.enabled:
            return SimpleNamespace(
                isDuplicate=False,
                existingStorageKey=None,
                checksumSha256Base64="",
            )

        stream = await storage.open_download_stream(storage_key, target=storage_target)
        chunks: List[bytes] = []
        async for chunk in stream:
            chunks.append(chunk)
        payload = b"".join(chunks)
        checksum = base64.b64encode(hashlib.sha256(payload).digest()).decode("ascii")

        versions = await self.db.find_many("fileVersions", where=[])
        for version in versions:
            if version.get("checksumSha256Base64") != checksum:
                continue
            if version.get("tenantId") != tenant_id:
                continue
            return SimpleNamespace(
                isDuplicate=True,
                existingStorageKey=version.get("storageKey"),
                checksumSha256Base64=checksum,
            )

        return SimpleNamespace(
            isDuplicate=False,
            existingStorageKey=None,
            checksumSha256Base64=checksum,
        )


def _ctx(
    principal_id: Optional[str] = "user_123",
    tenant_id: Optional[str] = "org_123",
    upload_session_token: Optional[str] = None,
):
    ctx = SimpleNamespace(principalId=principal_id, tenantId=tenant_id, requestId="req_001")
    if upload_session_token:
        ctx.uploadSessionToken = upload_session_token
    return ctx


def _make_service(
    db: Optional[FakeDB] = None,
    storage: Optional[FakeStorage] = None,
    dedup_enabled: bool = False,
    chunk_size: int = 3,
    allow_anonymous_uploads: bool = True,
) -> UploadSessionService:
    db = db or FakeDB()
    storage = storage or FakeStorage({"proxyStreamingUpload": True})
    dedup = FakeDedup(db=db, enabled=dedup_enabled)

    return create_upload_session_service(
        UploadSessionServiceConfig(
            db=db,
            storage=storage,
            policies=create_policy_registry(
                [
                    Policy(
                        name="user-avatar",
                        contentTypes=["image/png", "image/jpeg"],
                        maxSizeBytes=20_000_000,
                        visibility="private",
                    )
                ]
            ),
            events=create_event_emitter(),
            dedup=dedup,
            namespace="filefn",
            allow_anonymous_uploads=allow_anonymous_uploads,
            default_chunk_size_bytes=chunk_size,
            upload_session_ttl_seconds=3600,
        )
    )


@pytest.mark.asyncio
async def test_upload_mode_selection_is_capability_gated() -> None:
    service_a = _make_service(storage=FakeStorage({"signedUploadUrls": True, "multipart": True}))
    result_a = await service_a.create_session(
        CreateSessionInput(policy="user-avatar", fileName="a.png", size=3, mimeType="image/png"),
        _ctx(),
    )
    assert result_a["uploadMode"] == "multipart-signed-url"

    service_b = _make_service(storage=FakeStorage({"proxyStreamingUpload": True}))
    result_b = await service_b.create_session(
        CreateSessionInput(policy="user-avatar", fileName="b.png", size=3, mimeType="image/png"),
        _ctx(),
    )
    assert result_b["uploadMode"] == "proxy"

    service_c = _make_service(storage=FakeStorage({"signedUploadUrls": True, "multipart": False, "proxyStreamingUpload": False}))
    with pytest.raises(Exception) as exc_info:
        await service_c.create_session(
            CreateSessionInput(policy="user-avatar", fileName="c.png", size=3, mimeType="image/png"),
            _ctx(),
        )
    assert getattr(exc_info.value, "code", "") == "FILEFN_NO_SUPPORTED_UPLOAD_MODE"


@pytest.mark.asyncio
async def test_status_shape_uses_recorded_parts_canonical_fields() -> None:
    db = FakeDB()
    storage = FakeStorage({"proxyStreamingUpload": True})
    service = _make_service(db=db, storage=storage)

    session = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="resume.png", size=3, mimeType="image/png"),
        _ctx(),
    )

    await service.complete_part(session["uploadSessionId"], 1, "etag-1", 3, _ctx())
    status = await service.get_session_status(session["uploadSessionId"], _ctx())

    assert status["fileId"] == session["fileId"]
    assert status["recordedParts"] == [1]
    assert status["chunkSizeBytes"] == 3
    assert status["fileSize"] == 3
    assert status["totalParts"] == 1
    assert status["status"] in {"pending", "in_progress"}
    assert "expiresAt" in status
    assert "uploadedParts" not in status


@pytest.mark.asyncio
async def test_upload_session_binding_for_authenticated_and_anonymous_flows() -> None:
    service = _make_service()

    auth_session = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="auth.png", size=3, mimeType="image/png"),
        _ctx(principal_id="user_123", tenant_id="org_123"),
    )

    await service.get_session_status(auth_session["uploadSessionId"], _ctx("user_123", "org_123"))

    for method in (
        lambda: service.get_session_status(auth_session["uploadSessionId"], _ctx("user_999", "org_123")),
        lambda: service.sign_part(auth_session["uploadSessionId"], 1, 3, _ctx("user_999", "org_123")),
        lambda: service.complete_part(auth_session["uploadSessionId"], 1, "etag", 3, _ctx("user_999", "org_123")),
        lambda: service.complete_session(auth_session["uploadSessionId"], _ctx("user_999", "org_123")),
        lambda: service.abort_session(auth_session["uploadSessionId"], _ctx("user_999", "org_123")),
    ):
        with pytest.raises(Exception) as exc_info:
            await method()
        assert getattr(exc_info.value, "code", "") == "FILEFN_FORBIDDEN"

    anon_session = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="anon.png", size=3, mimeType="image/png"),
        _ctx(principal_id=None, tenant_id="org_123"),
    )
    token = anon_session.get("uploadSessionToken")
    assert isinstance(token, str) and token

    with pytest.raises(Exception) as exc_missing:
        await service.get_session_status(anon_session["uploadSessionId"], _ctx(principal_id=None, tenant_id="org_123"))
    assert getattr(exc_missing.value, "code", "") == "FILEFN_SESSION_TOKEN_REQUIRED"

    with pytest.raises(Exception) as exc_invalid:
        await service.get_session_status(
            anon_session["uploadSessionId"],
            _ctx(principal_id=None, tenant_id="org_123", upload_session_token="wrong-token"),
        )
    assert getattr(exc_invalid.value, "code", "") == "FILEFN_SESSION_TOKEN_INVALID"

    status = await service.get_session_status(
        anon_session["uploadSessionId"],
        _ctx(principal_id=None, tenant_id="org_123", upload_session_token=token),
    )
    assert status["uploadSessionId"] == anon_session["uploadSessionId"]


@pytest.mark.asyncio
async def test_anonymous_init_replay_rotates_token_and_persists_hash_only() -> None:
    db = FakeDB()
    service = _make_service(db=db)
    init = CreateSessionInput(
        policy="user-avatar",
        fileName="anon-replay.png",
        size=3,
        mimeType="image/png",
        idempotencyKey="idem_anon_001",
    )

    first = await service.create_session(init, _ctx(principal_id=None, tenant_id=None))
    replay = await service.create_session(init, _ctx(principal_id=None, tenant_id=None))

    assert first["uploadSessionId"] == replay["uploadSessionId"]
    assert first["uploadSessionToken"] != replay["uploadSessionToken"]

    session_row = await db.find_one(
        model="uploadSessions",
        where=[{"field": "uploadSessionId", "operator": "eq", "value": first["uploadSessionId"]}],
        namespace="filefn",
    )
    assert session_row is not None
    assert session_row["uploadSessionToken"] is None
    assert session_row["sessionTokenHash"] == service._hash_session_token(replay["uploadSessionToken"])


@pytest.mark.asyncio
async def test_create_session_respects_anonymous_upload_policy() -> None:
    service = _make_service(allow_anonymous_uploads=False)

    with pytest.raises(Exception) as exc_info:
        await service.create_session(
            CreateSessionInput(policy="user-avatar", fileName="anon-disabled.png", size=3, mimeType="image/png"),
            _ctx(principal_id=None, tenant_id="org_123"),
        )
    assert getattr(exc_info.value, "code", "") == "FILEFN_AUTH_REQUIRED"


@pytest.mark.asyncio
async def test_completion_persists_upload_metadata() -> None:
    db = FakeDB()
    storage = FakeStorage({"proxyStreamingUpload": True})
    service = _make_service(db=db, storage=storage)
    metadata = {"source": "nucleus", "isMeta": True}

    session = await service.create_session(
        CreateSessionInput(
            policy="user-avatar",
            fileName="meta.png",
            size=3,
            mimeType="image/png",
            metadata=metadata,
        ),
        _ctx(),
    )

    await service.record_proxy_part(session["uploadSessionId"], 1, b"abc", _ctx())
    completed = await service.complete_session(session["uploadSessionId"], _ctx())
    file_row = await db.find_one(
        model="files",
        where=[{"field": "fileId", "operator": "eq", "value": completed["fileId"]}],
        namespace="filefn",
    )

    assert file_row is not None
    assert file_row["metadata"] == metadata


@pytest.mark.asyncio
async def test_proxy_part_recording_idempotency_conflict_and_complete_idempotency() -> None:
    service = _make_service()

    session = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="proxy.png", size=3, mimeType="image/png"),
        _ctx(),
    )

    first = await service.record_proxy_part(session["uploadSessionId"], 1, b"abc", _ctx())
    second = await service.record_proxy_part(session["uploadSessionId"], 1, b"abc", _ctx())

    assert first["recorded"] is True
    assert second["recorded"] is True

    with pytest.raises(Exception) as exc_conflict:
        await service.record_proxy_part(session["uploadSessionId"], 1, b"xyz", _ctx())
    assert getattr(exc_conflict.value, "code", "") == "FILEFN_PART_CONFLICT"

    completed_once = await service.complete_session(session["uploadSessionId"], _ctx())
    completed_twice = await service.complete_session(session["uploadSessionId"], _ctx())

    assert completed_once["fileId"] == completed_twice["fileId"]
    assert completed_once["versionId"] == completed_twice["versionId"]

    incomplete_session = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="incomplete.png", size=6, mimeType="image/png"),
        _ctx(),
    )
    await service.record_proxy_part(incomplete_session["uploadSessionId"], 1, b"abc", _ctx())
    with pytest.raises(Exception) as exc_incomplete:
        await service.complete_session(incomplete_session["uploadSessionId"], _ctx())
    assert getattr(exc_incomplete.value, "code", "") == "FILEFN_UPLOAD_INCOMPLETE"


@pytest.mark.asyncio
async def test_complete_session_validates_uploaded_size_matches_declared_size() -> None:
    service = _make_service()
    session = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="size-mismatch.png", size=6, mimeType="image/png"),
        _ctx(),
    )

    await service.record_proxy_part(session["uploadSessionId"], 1, b"abc", _ctx())
    await service.record_proxy_part(session["uploadSessionId"], 2, b"xy", _ctx())

    with pytest.raises(Exception) as exc_info:
        await service.complete_session(session["uploadSessionId"], _ctx())
    assert getattr(exc_info.value, "code", "") == "FILEFN_UPLOAD_SIZE_MISMATCH"


@pytest.mark.asyncio
async def test_complete_session_uses_high_entropy_version_ids() -> None:
    service = _make_service()

    first = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="first.png", size=3, mimeType="image/png"),
        _ctx(),
    )
    second = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="second.png", size=3, mimeType="image/png"),
        _ctx(),
    )

    await service.record_proxy_part(first["uploadSessionId"], 1, b"abc", _ctx())
    await service.record_proxy_part(second["uploadSessionId"], 1, b"xyz", _ctx())

    completed_first = await service.complete_session(first["uploadSessionId"], _ctx())
    completed_second = await service.complete_session(second["uploadSessionId"], _ctx())

    assert completed_first["versionId"].startswith("ver_")
    assert completed_second["versionId"].startswith("ver_")
    assert "." not in completed_first["versionId"]
    assert completed_first["versionId"] != completed_second["versionId"]


@pytest.mark.asyncio
async def test_garbage_collection_removes_expired_sessions_and_preserves_completed() -> None:
    db = FakeDB()
    storage = FakeStorage({"proxyStreamingUpload": True})
    service = _make_service(db=db, storage=storage)

    now = datetime.now(timezone.utc)
    expired = (now - timedelta(hours=1)).isoformat()
    future = (now + timedelta(hours=1)).isoformat()

    await db.create(
        model="uploadSessions",
        data={
            "uploadSessionId": "upl_expired",
            "status": "in_progress",
            "policy": "user-avatar",
            "fileId": "file_a",
            "fileName": "a.png",
            "mimeType": "image/png",
            "size": 3,
            "uploadMode": "proxy",
            "chunkSizeBytes": 3,
            "totalParts": 1,
            "storageKey": "org_123/user_123/file_a/ver_a-a.png",
            "storageUploadId": None,
            "ownerId": "user_123",
            "tenantId": "org_123",
            "expiresAt": expired,
            "createdAt": now.isoformat(),
        },
    )
    await db.create(
        model="uploadParts",
        data={"uploadSessionId": "upl_expired", "partNumber": 1, "etag": "etag-1", "size": 3},
    )
    storage.objects["org_123/user_123/file_a/ver_a-a.png.parts/1"] = b"abc"

    await db.create(
        model="uploadSessions",
        data={
            "uploadSessionId": "upl_completed",
            "status": "completed",
            "policy": "user-avatar",
            "fileId": "file_b",
            "fileName": "b.png",
            "mimeType": "image/png",
            "size": 3,
            "uploadMode": "proxy",
            "chunkSizeBytes": 3,
            "totalParts": 1,
            "storageKey": "org_123/user_123/file_b/ver_b-b.png",
            "storageUploadId": None,
            "ownerId": "user_123",
            "tenantId": "org_123",
            "expiresAt": future,
            "createdAt": now.isoformat(),
        },
    )

    result = await service.garbage_collect_expired_sessions()

    assert result["deletedSessions"] == 1
    assert result["preservedCompletedSessions"] == 1
    assert await db.find_one("uploadSessions", [{"field": "uploadSessionId", "operator": "eq", "value": "upl_expired"}]) is None
    assert await db.find_one("uploadSessions", [{"field": "uploadSessionId", "operator": "eq", "value": "upl_completed"}]) is not None
    assert "org_123/user_123/file_a/ver_a-a.png.parts/1" not in storage.objects


@pytest.mark.asyncio
async def test_dedupe_reuses_storage_within_tenant_but_not_cross_tenant() -> None:
    db = FakeDB()
    storage = FakeStorage({"proxyStreamingUpload": True})
    service = _make_service(db=db, storage=storage, dedup_enabled=True)

    first = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="a.png", size=3, mimeType="image/png"),
        _ctx("user_123", "org_123"),
    )
    await service.record_proxy_part(first["uploadSessionId"], 1, b"abc", _ctx("user_123", "org_123"))
    completed_first = await service.complete_session(first["uploadSessionId"], _ctx("user_123", "org_123"))

    second = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="b.png", size=3, mimeType="image/png"),
        _ctx("user_123", "org_123"),
    )
    await service.record_proxy_part(second["uploadSessionId"], 1, b"abc", _ctx("user_123", "org_123"))
    completed_second = await service.complete_session(second["uploadSessionId"], _ctx("user_123", "org_123"))

    third = await service.create_session(
        CreateSessionInput(policy="user-avatar", fileName="c.png", size=3, mimeType="image/png"),
        _ctx("user_999", "org_999"),
    )
    await service.record_proxy_part(third["uploadSessionId"], 1, b"abc", _ctx("user_999", "org_999"))
    completed_third = await service.complete_session(third["uploadSessionId"], _ctx("user_999", "org_999"))

    first_version = await db.find_one(
        "fileVersions",
        [{"field": "fileId", "operator": "eq", "value": completed_first["fileId"]}],
    )
    second_version = await db.find_one(
        "fileVersions",
        [{"field": "fileId", "operator": "eq", "value": completed_second["fileId"]}],
    )
    third_version = await db.find_one(
        "fileVersions",
        [{"field": "fileId", "operator": "eq", "value": completed_third["fileId"]}],
    )

    assert first_version is not None and second_version is not None and third_version is not None
    assert second_version["storageKey"] == first_version["storageKey"]
    assert third_version["storageKey"] != first_version["storageKey"]


@pytest.mark.asyncio
async def test_routed_storage_routes_durable_and_temporary_uploads() -> None:
    db = FakeDB()
    durable = FakeStorage({"signedUploadUrls": True, "multipart": True, "proxyStreamingDownload": True})
    durable.name = "durable"
    temporary = FakeStorage({"signedUploadUrls": True, "multipart": True, "proxyStreamingDownload": True})
    temporary.name = "temporary"
    storage = create_routed_storage_adapter(
        {"durable": durable, "temporary": temporary},
        default_target="durable",
    )
    service = create_upload_session_service(
        UploadSessionServiceConfig(
            db=db,
            storage=storage,
            policies=create_policy_registry(
                [
                    Policy(name="durable-policy", contentTypes=["image/png"], storageTarget="durable"),
                    Policy(name="temporary-policy", contentTypes=["image/png"], storageTarget="temporary"),
                ]
            ),
            events=create_event_emitter(),
            namespace="filefn",
        )
    )

    await service.create_session(
        CreateSessionInput(policy="durable-policy", fileName="a.png", size=3, mimeType="image/png"),
        _ctx("user_123", "org_123"),
    )
    await service.create_session(
        CreateSessionInput(policy="temporary-policy", fileName="b.png", size=3, mimeType="image/png"),
        _ctx("user_123", "org_123"),
    )

    assert any(call.startswith("durable:multipart:") for call in durable.calls)
    assert any(call.startswith("temporary:multipart:") for call in temporary.calls)


@pytest.mark.asyncio
async def test_nucleus_policy_bundle_enforces_size_and_wildcard_types() -> None:
    registry = create_policy_registry(create_nucleus_policies())
    durable = registry.get("nucleus-durable-default")
    temporary = registry.get("nucleus-temporary-default")

    assert durable is not None and temporary is not None
    assert durable.maxSizeBytes == 104857600
    assert durable.renderProfile == "nucleus"
    assert durable.storageTarget == "durable"
    assert temporary.storageTarget == "temporary"

    service = _make_service(db=FakeDB(), storage=FakeStorage({"signedUploadUrls": True, "multipart": True}))
    service.policies = registry

    ok = await service.create_session(
        CreateSessionInput(
            policy="nucleus-durable-default",
            fileName="document.pdf",
            size=104857600,
            mimeType="application/pdf",
        ),
        _ctx("user_123", "org_123"),
    )
    assert ok["uploadSessionId"].startswith("upl_")

    with pytest.raises(Exception) as exc_size:
        await service.create_session(
            CreateSessionInput(
                policy="nucleus-durable-default",
                fileName="too-big.pdf",
                size=104857601,
                mimeType="application/pdf",
            ),
            _ctx("user_123", "org_123"),
        )
    assert getattr(exc_size.value, "code", "") == "FILEFN_POLICY_MAX_SIZE_EXCEEDED"

    with pytest.raises(Exception) as exc_mime:
        await service.create_session(
            CreateSessionInput(
                policy="nucleus-temporary-default",
                fileName="notes.zip",
                size=10,
                mimeType="application/zip",
            ),
            _ctx("user_123", "org_123"),
        )
    assert getattr(exc_mime.value, "code", "") == "FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED"
