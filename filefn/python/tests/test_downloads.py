from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from filefn.server import create_event_emitter
from filefn.server import create_routed_storage_adapter
from filefn.server.files.service import FileServiceConfig, create_file_service
from filefn.server.policies import Policy, create_policy_registry
from filefn.server.shares.service import CreateShareLinkInput, SharesServiceConfig, create_shares_service


class FakeDB:
    def __init__(self) -> None:
        self.tables: Dict[str, List[Dict[str, Any]]] = {}
        self.find_many_calls: List[Dict[str, Any]] = []

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
        self.find_many_calls.append({"model": model, "where": where, "order_by": order_by, "limit": limit})
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
        for index, row in enumerate(rows):
            if self._matches(row, where):
                return rows.pop(index)
        return None

    async def delete_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: Optional[str] = None,
    ) -> int:
        rows = self._table(model)
        retained = [row for row in rows if not self._matches(row, where)]
        deleted = len(rows) - len(retained)
        self.tables[model] = retained
        return deleted


class FlakyShareDB(FakeDB):
    def __init__(self) -> None:
        super().__init__()
        self.share_update_conflicts = 1

    async def update(
        self,
        model: str,
        where: List[Dict[str, Any]],
        data: Dict[str, Any],
        namespace: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if (
            model == "fileShares"
            and self.share_update_conflicts > 0
            and any(clause.get("field") == "downloads" for clause in where)
        ):
            self.share_update_conflicts -= 1
            return None
        return await super().update(model=model, where=where, data=data, namespace=namespace)


class FakeStorage:
    def __init__(self, with_signing: bool = False) -> None:
        self.with_signing = with_signing
        self.delete_calls: List[str] = []
        self.name = "fake"

    async def sign_download_url(self, key: str, expires_in_seconds: int, target: Optional[str] = None) -> Dict[str, Any]:
        if not self.with_signing:
            raise RuntimeError("signing not supported")
        return {"url": f"https://download.local/{key}", "headers": {}}

    async def open_download_stream(self, key: str, target: Optional[str] = None):
        async def _gen():
            yield b"bytes"

        return _gen()

    async def delete_object(self, key: str, target: Optional[str] = None) -> None:
        self.delete_calls.append(f"{target or 'default'}:{key}")
        return None


def _ctx(principal_id: Optional[str], tenant_id: Optional[str] = "org_123"):
    return SimpleNamespace(principalId=principal_id, tenantId=tenant_id, requestId="req_001")


async def _seed_file_rows(db: FakeDB) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.create(
        model="files",
        data={
            "fileId": "file_0001",
            "currentVersionId": "ver_0001",
            "ownerId": "user_123",
            "tenantId": "org_123",
            "visibility": "private",
            "policy": "user-avatar",
            "mimeType": "image/png",
            "size": 3,
            "name": "a.png",
            "metadata": {},
            "createdAt": now,
            "updatedAt": now,
        },
    )
    await db.create(
        model="fileVersions",
        data={
            "versionId": "ver_0001",
            "fileId": "file_0001",
            "storageKey": "org_123/user_123/file_0001/ver_0001-a.png",
            "mimeType": "image/png",
            "size": 3,
            "checksumSha256Base64": None,
            "tenantId": "org_123",
            "createdAt": now,
        },
    )
    await db.create(
        model="fileVersions",
        data={
            "versionId": "ver_old",
            "fileId": "file_0001",
            "storageKey": "org_123/user_123/file_0001/ver_old-a.png",
            "mimeType": "image/jpeg",
            "size": 9,
            "checksumSha256Base64": "sha-old",
            "tenantId": "org_123",
            "createdAt": "2026-03-20T00:00:00+00:00",
        },
    )
    await db.create(
        model="fileVersions",
        data={
            "versionId": "ver_other_file",
            "fileId": "file_9999",
            "storageKey": "org_123/user_123/file_9999/ver_other_file-a.png",
            "mimeType": "image/png",
            "size": 3,
            "checksumSha256Base64": None,
            "tenantId": "org_123",
            "createdAt": now,
        },
    )


class RecordingQuota:
    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []

    async def record_usage(self, input: Dict[str, Any]) -> None:
        self.calls.append(dict(input))


@pytest.mark.asyncio
async def test_file_download_urls_are_real_and_enforce_version_binding() -> None:
    db = FakeDB()
    await _seed_file_rows(db)

    file_service = create_file_service(
        FileServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=False),
            events=create_event_emitter(),
            namespace="filefn",
        )
    )

    good = await file_service.get_download_url("file_0001", "ver_0001", _ctx("user_123"))
    assert good["url"] == "/proxy/files/file_0001/versions/ver_0001/download"
    assert not good["url"].startswith("proxy://")

    with pytest.raises(Exception) as exc_info:
        await file_service.get_download_url("file_0001", "ver_other_file", _ctx("user_123"))
    assert getattr(exc_info.value, "code", "") == "FILEFN_NOT_FOUND"

    with pytest.raises(Exception) as exc_file:
        await file_service.get_file("file_0001", _ctx("user_123"), version_id="ver_other_file")
    assert getattr(exc_file.value, "code", "") == "FILEFN_NOT_FOUND"


@pytest.mark.asyncio
async def test_version_aware_get_file_and_list_files_are_deterministic() -> None:
    db = FakeDB()
    await _seed_file_rows(db)
    now = "2026-03-22T00:00:00+00:00"

    await db.create(
        model="files",
        data={
            "fileId": "file_0002",
            "currentVersionId": "ver_0002",
            "ownerId": "user_123",
            "tenantId": "org_123",
            "visibility": "private",
            "policy": "user-avatar",
            "mimeType": "image/png",
            "size": 4,
            "name": "b.png",
            "metadata": {},
            "createdAt": now,
            "updatedAt": now,
        },
    )
    await db.create(
        model="files",
        data={
            "fileId": "file_hidden",
            "currentVersionId": "ver_hidden",
            "ownerId": "other_user",
            "tenantId": "org_123",
            "visibility": "private",
            "policy": "user-avatar",
            "mimeType": "image/png",
            "size": 4,
            "name": "hidden.png",
            "metadata": {},
            "createdAt": now,
            "updatedAt": now,
        },
    )

    await db.update(
        model="files",
        where=[{"field": "fileId", "operator": "eq", "value": "file_0001"}],
        data={"updatedAt": now},
    )

    file_service = create_file_service(
        FileServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=False),
            events=create_event_emitter(),
            namespace="filefn",
        )
    )

    versioned = await file_service.get_file("file_0001", _ctx("user_123"), version_id="ver_old")
    assert versioned["versionId"] == "ver_old"
    assert versioned["currentVersionId"] == "ver_old"
    assert versioned["mimeType"] == "image/jpeg"
    assert versioned["size"] == 9
    assert versioned["checksumSha256Base64"] == "sha-old"

    first_page = await file_service.list_files(_ctx("user_123"), {"limit": 1})
    assert [file["fileId"] for file in first_page["files"]] == ["file_0001"]
    assert first_page["nextCursor"]

    second_page = await file_service.list_files(
        _ctx("user_123"),
        {"limit": 2, "cursor": first_page["nextCursor"]},
    )
    assert [file["fileId"] for file in second_page["files"]] == ["file_0002"]
    assert not any(
        call["model"] == "files" and call["where"] == []
        for call in db.find_many_calls
    )
    assert any(
        call["model"] == "files"
        and call["limit"] == 2
        and call["order_by"] == [
            {"field": "updatedAt", "direction": "desc"},
            {"field": "fileId", "direction": "asc"},
        ]
        for call in db.find_many_calls
    )


@pytest.mark.asyncio
async def test_share_proxy_descriptor_defers_download_counter_until_stream_access() -> None:
    db = FakeDB()
    await _seed_file_rows(db)

    shares_service = create_shares_service(
        SharesServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=False),
            namespace="filefn",
        )
    )

    create_res = await shares_service.create_share_link(
        CreateShareLinkInput(fileId="file_0001", versionId="ver_0001"),
        _ctx("user_123"),
    )

    token = create_res["token"]
    descriptor = await shares_service.download_via_share_link(token, _ctx(None), is_authenticated=False)

    assert descriptor["url"] == f"/proxy/share-links/{token}/download"
    assert descriptor["url"].startswith("/")

    share_rows = await db.find_many("fileShares", where=[])
    assert share_rows[0]["downloads"] == 0

    stream_result = await shares_service.get_download_stream_via_share_link(
        token,
        _ctx(None),
        is_authenticated=False,
    )
    payload = []
    async for chunk in stream_result["stream"]:
        payload.append(chunk)

    assert b"".join(payload) == b"bytes"
    share_rows = await db.find_many("fileShares", where=[])
    assert share_rows[0]["downloads"] == 1


@pytest.mark.asyncio
async def test_signed_share_descriptor_increments_downloads_once() -> None:
    db = FakeDB()
    await _seed_file_rows(db)

    shares_service = create_shares_service(
        SharesServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=True),
            namespace="filefn",
        )
    )
    shares_service.storage.capabilities = {"signedDownloadUrls": True}

    create_res = await shares_service.create_share_link(
        CreateShareLinkInput(fileId="file_0001", versionId="ver_0001"),
        _ctx("user_123"),
    )

    token = create_res["token"]
    descriptor = await shares_service.download_via_share_link(token, _ctx(None), is_authenticated=False)

    assert descriptor["url"].startswith("https://download.local/")
    share_rows = await db.find_many("fileShares", where=[])
    assert share_rows[0]["downloads"] == 1


@pytest.mark.asyncio
async def test_signed_share_descriptor_retries_download_reservation_conflicts() -> None:
    db = FlakyShareDB()
    await _seed_file_rows(db)

    shares_service = create_shares_service(
        SharesServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=True),
            namespace="filefn",
        )
    )
    shares_service.storage.capabilities = {"signedDownloadUrls": True}

    create_res = await shares_service.create_share_link(
        CreateShareLinkInput(fileId="file_0001", versionId="ver_0001", maxDownloads=1),
        _ctx("user_123"),
    )

    token = create_res["token"]
    descriptor = await shares_service.download_via_share_link(token, _ctx(None), is_authenticated=False)

    assert descriptor["url"].startswith("https://download.local/")

    share_rows = await db.find_many("fileShares", where=[])
    assert share_rows[0]["downloads"] == 1

    with pytest.raises(Exception) as exc_info:
        await shares_service.download_via_share_link(token, _ctx(None), is_authenticated=False)
    assert getattr(exc_info.value, "code", "") == "FILEFN_SHARE_DOWNLOADS_EXCEEDED"


@pytest.mark.asyncio
async def test_share_download_binding_mismatch_is_not_found_and_downloads_not_incremented() -> None:
    db = FakeDB()
    await _seed_file_rows(db)

    shares_service = create_shares_service(
        SharesServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=False),
            namespace="filefn",
        )
    )

    token = "shr_live_bad"
    await db.create(
        model="fileShares",
        data={
            "tokenHash": shares_service._hash_token(token),  # parity check for token hashing path
            "fileId": "file_0001",
            "versionId": "ver_other_file",
            "expiresAt": None,
            "requiresAuth": False,
            "maxDownloads": None,
            "downloads": 0,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "revokedAt": None,
        },
    )

    with pytest.raises(Exception) as exc_info:
        await shares_service.download_via_share_link(token, _ctx(None), is_authenticated=False)
    assert getattr(exc_info.value, "code", "") == "FILEFN_NOT_FOUND"

    share_rows = await db.find_many("fileShares", where=[])
    assert share_rows[0]["downloads"] == 0


@pytest.mark.asyncio
async def test_delete_cascade_is_metadata_complete_and_reference_safe() -> None:
    db = FakeDB()
    storage = FakeStorage(with_signing=False)
    quota = RecordingQuota()
    now = datetime.now(timezone.utc).isoformat()

    await db.create(
        model="files",
        data={
            "fileId": "file_1",
            "currentVersionId": "ver_1",
            "ownerId": "user_123",
            "tenantId": "org_123",
            "visibility": "private",
            "policy": "user-avatar",
            "mimeType": "image/png",
            "size": 10,
            "name": "one.png",
            "metadata": {},
            "createdAt": now,
            "updatedAt": now,
        },
    )
    await db.create(
        model="files",
        data={
            "fileId": "file_2",
            "currentVersionId": "ver_2",
            "ownerId": "user_123",
            "tenantId": "org_123",
            "visibility": "private",
            "policy": "user-avatar",
            "mimeType": "image/png",
            "size": 10,
            "name": "two.png",
            "metadata": {},
            "createdAt": now,
            "updatedAt": now,
        },
    )
    await db.create(
        model="fileVersions",
        data={
            "versionId": "ver_1",
            "fileId": "file_1",
            "storageKey": "durable/shared/key",
            "mimeType": "image/png",
            "size": 10,
            "checksumSha256Base64": None,
            "tenantId": "org_123",
            "createdAt": now,
        },
    )
    await db.create(
        model="fileVersions",
        data={
            "versionId": "ver_2",
            "fileId": "file_2",
            "storageKey": "durable/shared/key",
            "mimeType": "image/png",
            "size": 10,
            "checksumSha256Base64": None,
            "tenantId": "org_123",
            "createdAt": now,
        },
    )
    await db.create(
        model="fileArtifacts",
        data={
            "artifactId": "art_1",
            "fileId": "file_1",
            "versionId": "ver_1",
            "kind": "thumbnail",
            "storageKey": "durable/artifacts/file_1-thumb",
            "mimeType": "image/png",
            "size": 4,
            "metadata": {},
            "createdAt": now,
        },
    )
    await db.create(
        model="filePermissions",
        data={
            "permissionId": "perm_1",
            "fileId": "file_1",
            "userId": "user_456",
            "role": None,
            "tenantId": None,
            "canRead": True,
            "canWrite": False,
            "canDelete": False,
            "canShare": False,
            "expiresAt": None,
            "createdAt": now,
        },
    )
    await db.create(
        model="fileShares",
        data={
            "tokenHash": "hash_1",
            "fileId": "file_1",
            "versionId": "ver_1",
            "expiresAt": None,
            "requiresAuth": False,
            "maxDownloads": None,
            "downloads": 0,
            "createdAt": now,
            "revokedAt": None,
        },
    )
    await db.create(
        model="uploadSessions",
        data={
            "uploadSessionId": "upl_pending",
            "status": "in_progress",
            "policy": "user-avatar",
            "fileId": "file_1",
            "fileName": "one.png",
            "mimeType": "image/png",
            "size": 10,
            "uploadMode": "proxy",
            "chunkSizeBytes": 10,
            "totalParts": 1,
            "storageKey": "tmp/upload/file_1",
            "storageUploadId": None,
            "ownerId": "user_123",
            "tenantId": "org_123",
            "expiresAt": now,
            "createdAt": now,
        },
    )
    await db.create(
        model="uploadParts",
        data={
            "uploadSessionId": "upl_pending",
            "partNumber": 1,
            "etag": "etag_1",
            "size": 10,
        },
    )

    file_service = create_file_service(
        FileServiceConfig(
            db=db,
            storage=storage,
            events=create_event_emitter(),
            quota=quota,
            namespace="filefn",
        )
    )

    await file_service.delete_file("file_1", _ctx("user_123"))

    assert await db.find_one("files", where=[{"field": "fileId", "operator": "eq", "value": "file_1"}]) is None
    assert await db.find_many("filePermissions", where=[{"field": "fileId", "operator": "eq", "value": "file_1"}]) == []
    assert await db.find_many("fileShares", where=[{"field": "fileId", "operator": "eq", "value": "file_1"}]) == []
    assert await db.find_many("fileArtifacts", where=[{"field": "fileId", "operator": "eq", "value": "file_1"}]) == []
    assert await db.find_many("uploadSessions", where=[{"field": "fileId", "operator": "eq", "value": "file_1"}]) == []
    assert "durable:durable/shared/key" not in storage.delete_calls
    assert "durable:durable/artifacts/file_1-thumb" in storage.delete_calls
    assert "durable:tmp/upload/file_1.parts/1" in storage.delete_calls
    assert quota.calls == []

    await file_service.delete_file("file_2", _ctx("user_123"))

    assert "durable:durable/shared/key" in storage.delete_calls
    assert quota.calls[-1]["bytes"] == -10


@pytest.mark.asyncio
async def test_delete_treats_same_storage_key_in_different_targets_as_distinct() -> None:
    db = FakeDB()
    now = datetime.now(timezone.utc).isoformat()

    for file_id, policy in (("file_durable", "durable-policy"), ("file_temporary", "temporary-policy")):
        await db.create(
            model="files",
            data={
                "fileId": file_id,
                "currentVersionId": f"ver_{file_id}",
                "ownerId": "user_123",
                "tenantId": "org_123",
                "visibility": "private",
                "policy": policy,
                "mimeType": "image/png",
                "size": 10,
                "name": f"{file_id}.png",
                "metadata": {},
                "createdAt": now,
                "updatedAt": now,
            },
        )
        await db.create(
            model="fileVersions",
            data={
                "versionId": f"ver_{file_id}",
                "fileId": file_id,
                "storageKey": "shared/object.png",
                "mimeType": "image/png",
                "size": 10,
                "checksumSha256Base64": None,
                "tenantId": "org_123",
                "createdAt": now,
            },
        )

    durable = FakeStorage()
    temporary = FakeStorage()
    storage = create_routed_storage_adapter(
        {"durable": durable, "temporary": temporary},
        default_target="durable",
    )
    service = create_file_service(
        FileServiceConfig(
            db=db,
            storage=storage,
            policies=create_policy_registry(
                [
                    Policy(name="durable-policy", storageTarget="durable"),
                    Policy(name="temporary-policy", storageTarget="temporary"),
                ]
            ),
            events=create_event_emitter(),
            namespace="filefn",
        )
    )

    await service.delete_file("file_durable", _ctx("user_123"))
    assert "default:shared/object.png" in durable.delete_calls
    assert "default:shared/object.png" not in temporary.delete_calls

    await service.delete_file("file_temporary", _ctx("user_123"))
    assert "default:shared/object.png" in temporary.delete_calls


@pytest.mark.asyncio
async def test_read_grants_ignore_expired_permissions() -> None:
    db = FakeDB()
    await _seed_file_rows(db)
    await db.update(
        model="files",
        where=[{"field": "fileId", "operator": "eq", "value": "file_0001"}],
        data={"ownerId": "owner_user"},
    )
    await db.create(
        model="filePermissions",
        data={
            "permissionId": "perm_valid",
            "fileId": "file_0001",
            "userId": "user_123",
            "tenantId": None,
            "canRead": True,
            "canWrite": False,
            "canDelete": False,
            "canShare": False,
            "expiresAt": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        },
    )

    service = create_file_service(
        FileServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=False),
            events=create_event_emitter(),
            namespace="filefn",
        )
    )

    with pytest.raises(Exception) as exc_info:
        await service.get_file("file_0001", _ctx("user_123"))
    assert getattr(exc_info.value, "code", "") == "FILEFN_FORBIDDEN"


@pytest.mark.asyncio
async def test_delete_file_removes_completed_upload_sessions() -> None:
    db = FakeDB()
    now = datetime.now(timezone.utc).isoformat()
    await db.create(
        model="files",
        data={
            "fileId": "file_cleanup",
            "currentVersionId": "ver_cleanup",
            "ownerId": "user_123",
            "tenantId": "org_123",
            "visibility": "private",
            "policy": "user-avatar",
            "mimeType": "image/png",
            "size": 3,
            "name": "cleanup.png",
            "metadata": {},
            "createdAt": now,
            "updatedAt": now,
        },
    )
    await db.create(
        model="fileVersions",
        data={
            "versionId": "ver_cleanup",
            "fileId": "file_cleanup",
            "storageKey": "uploads/file_cleanup/ver_cleanup.png",
            "mimeType": "image/png",
            "size": 3,
            "checksumSha256Base64": None,
            "tenantId": "org_123",
            "createdAt": now,
        },
    )
    await db.create(
        model="uploadSessions",
        data={
            "uploadSessionId": "upl_completed",
            "status": "completed",
            "policy": "user-avatar",
            "fileId": "file_cleanup",
            "fileName": "cleanup.png",
            "mimeType": "image/png",
            "size": 3,
            "uploadMode": "proxy",
            "chunkSizeBytes": 3,
            "totalParts": 1,
            "storageKey": "uploads/file_cleanup/ver_cleanup.png",
            "storageUploadId": None,
            "ownerId": "user_123",
            "tenantId": "org_123",
            "metadata": {},
            "expiresAt": now,
            "createdAt": now,
        },
    )

    service = create_file_service(
        FileServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=False),
            events=create_event_emitter(),
            namespace="filefn",
        )
    )

    await service.delete_file("file_cleanup", _ctx("user_123"))
    assert await db.find_many("uploadSessions", where=[{"field": "fileId", "operator": "eq", "value": "file_cleanup"}]) == []
