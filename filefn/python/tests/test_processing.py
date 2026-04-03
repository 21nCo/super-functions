from __future__ import annotations

import asyncio
import io
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from filefn.processing import (
    PDF_PREVIEW_SUPPORTED_MIME_TYPES,
    create_audio_processor,
    create_image_transform_processor,
    create_ocr_processor,
    create_pdf_preview_processor,
    create_thumbnail_processor,
    create_video_processor,
)
from filefn.processing.types import (
    ImageTransformConfig,
    ImageTransformOperation,
    PdfPreviewConfig,
    ResizeOptions,
    RotateOptions,
    ThumbnailConfig,
)
from filefn.server import create_event_emitter, create_routed_storage_adapter
from filefn.server.policies import Policy, create_policy_registry
from filefn.server.processing.service import (
    ProcessingServiceConfig,
    ProcessorInput,
    ProcessorOutputArtifact,
    ProcessorResult,
    create_processing_service,
)


def _assert_image_artifact_format_consistency(artifact: ProcessorOutputArtifact) -> None:
    if artifact.data.startswith(b"\x89PNG\r\n\x1a\n"):
        assert artifact.mimeType == "image/png"
        assert artifact.storageKey.endswith(".png")
        return

    riff_magic = artifact.data[:4]
    webp_signature = artifact.data[8:12]
    if riff_magic == b"RIFF" and webp_signature == b"WEBP":
        assert artifact.mimeType == "image/webp"
        assert artifact.storageKey.endswith(".webp")
        return

    # Placeholder conversion can emit JPEG when Pillow is available.
    assert artifact.mimeType == "image/jpeg"
    assert artifact.storageKey.endswith(".jpg")


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


class FakeStorage:
    def __init__(self, with_signing: bool = False) -> None:
        self.with_signing = with_signing
        self.objects: Dict[str, bytes] = {}
        self.put_calls: List[Dict[str, Any]] = []
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

    async def put_object(
        self,
        key: str,
        data: Any,
        metadata: Optional[Dict[str, str]] = None,
        target: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = self._coerce_bytes(data)
        self.objects[key] = payload
        self.put_calls.append({"key": key, "metadata": metadata or {}, "target": target})
        return {
            "key": key,
            "size": len(payload),
            "etag": "etag",
            "lastModified": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
        }

    async def open_download_stream(self, key: str, target: Optional[str] = None):
        payload = self.objects.get(key, b"")

        async def _gen():
            yield payload

        return _gen()

    async def sign_download_url(self, key: str, expires_in_seconds: int, target: Optional[str] = None) -> Dict[str, Any]:
        if not self.with_signing:
            raise RuntimeError("signing unavailable")
        return {"url": f"https://download.local/{key}", "headers": {}}


class ThumbnailLikeProcessor:
    name = "thumbnail"
    supportedMimeTypes = ["image/png"]

    async def process(self, input: ProcessorInput, get_data):
        raw = await get_data()
        return ProcessorResult(
            success=True,
            artifacts=[
                ProcessorOutputArtifact(
                    kind="thumbnail-small",
                    data=raw,
                    mimeType="image/png",
                    storageKey=f"{input.storageKey}.thumb.png",
                    metadata={"source": input.fileId},
                )
            ],
        )


class RecordingQueue:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.jobs: List[Dict[str, Any]] = []

    async def add(self, job: Any) -> Dict[str, Any]:
        if self.fail:
            raise RuntimeError("queue down")
        payload = dict(job)
        self.jobs.append(payload)
        return {"jobId": "job_001"}


class FlowProvider:
    def __init__(self, queue: RecordingQueue) -> None:
        self.queue = queue

    def get_queue(self, name: str):
        return self.queue


def _ctx(principal_id: Optional[str], tenant_id: Optional[str] = "org_123"):
    return SimpleNamespace(principalId=principal_id, tenantId=tenant_id, requestId="req_001")


async def _seed_file_and_artifact(db: FakeDB) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.create(
        model="files",
        data={
            "fileId": "file_001",
            "currentVersionId": "ver_001",
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
        model="fileArtifacts",
        data={
            "artifactId": "art_001",
            "fileId": "file_001",
            "versionId": "ver_001",
            "kind": "thumbnail-small",
            "storageKey": "org_123/user_123/file_001/ver_001-a.png.thumb.png",
            "mimeType": "image/png",
            "size": 3,
            "metadata": {},
            "createdAt": now,
        },
    )


def test_processing_public_imports_include_pdf_preview() -> None:
    assert callable(create_pdf_preview_processor)
    assert callable(create_thumbnail_processor)
    assert PDF_PREVIEW_SUPPORTED_MIME_TYPES == ["application/pdf"]


def _make_png(width: int = 8, height: int = 8) -> bytes:
    from PIL import Image

    image = Image.new("RGBA", (width, height), (40, 120, 200, 255))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _make_jpeg(width: int = 8, height: int = 8) -> bytes:
    from PIL import Image

    image = Image.new("RGB", (width, height), (180, 140, 80))
    out = io.BytesIO()
    image.save(out, format="JPEG")
    return out.getvalue()


def _make_animated_gif() -> bytes:
    from PIL import Image

    first = Image.new("RGBA", (4, 4), (255, 0, 0, 255))
    second = Image.new("RGBA", (4, 4), (0, 0, 255, 255))
    out = io.BytesIO()
    first.save(out, format="GIF", save_all=True, append_images=[second], loop=0, duration=50)
    return out.getvalue()


@pytest.mark.asyncio
async def test_processing_uses_put_object_and_creates_artifacts() -> None:
    db = FakeDB()
    storage = FakeStorage()
    storage.objects["org_123/user_123/file_001/ver_001-a.png"] = b"abc"

    service = create_processing_service(
        ProcessingServiceConfig(
            db=db,
            storage=storage,
            events=create_event_emitter(),
            processors=[ThumbnailLikeProcessor()],
            namespace="filefn",
            enabled=True,
        )
    )

    result = await service.run_processing(
        ProcessorInput(
            fileId="file_001",
            versionId="ver_001",
            storageKey="org_123/user_123/file_001/ver_001-a.png",
            mimeType="image/png",
            size=3,
            fileName="a.png",
            tenantId="org_123",
        ),
        _ctx("user_123"),
    )

    assert result["artifactsCreated"] == 1
    assert len(storage.put_calls) == 1
    assert storage.put_calls[0]["key"].endswith(".thumb.png")


@pytest.mark.asyncio
async def test_processing_queue_enqueue_uses_deterministic_idempotency_key_and_surfaces_failures() -> None:
    ok_queue = RecordingQueue(fail=False)
    service_ok = create_processing_service(
        ProcessingServiceConfig(
            db=FakeDB(),
            storage=FakeStorage(),
            events=create_event_emitter(),
            processors=[ThumbnailLikeProcessor()],
            flow_fn=FlowProvider(ok_queue),
            namespace="filefn",
            enabled=True,
        )
    )

    queued = await service_ok.trigger_processing(
        {
            "fileId": "file_001",
            "versionId": "ver_001",
            "storageKey": "k",
            "mimeType": "image/png",
            "size": 3,
            "fileName": "a.png",
            "tenantId": "org_123",
        },
        _ctx("user_123"),
    )

    assert queued["enqueued"] is True
    assert ok_queue.jobs[0]["idempotencyKey"] == "processing:file_001:ver_001:thumbnail"

    bad_queue = RecordingQueue(fail=True)
    service_bad = create_processing_service(
        ProcessingServiceConfig(
            db=FakeDB(),
            storage=FakeStorage(),
            events=create_event_emitter(),
            processors=[ThumbnailLikeProcessor()],
            flow_fn=FlowProvider(bad_queue),
            namespace="filefn",
            enabled=True,
        )
    )

    with pytest.raises(Exception) as exc_info:
        await service_bad.trigger_processing(
            {
                "fileId": "file_001",
                "versionId": "ver_001",
                "storageKey": "k",
                "mimeType": "image/png",
                "size": 3,
                "fileName": "a.png",
                "tenantId": "org_123",
            },
            _ctx("user_123"),
        )
    assert getattr(exc_info.value, "code", "") == "FILEFN_PROCESSING_ENQUEUE_FAILED"


@pytest.mark.asyncio
async def test_artifact_access_authorization_and_proxy_descriptor_shape() -> None:
    db = FakeDB()
    await _seed_file_and_artifact(db)

    service = create_processing_service(
        ProcessingServiceConfig(
            db=db,
            storage=FakeStorage(with_signing=False),
            events=create_event_emitter(),
            processors=[],
            namespace="filefn",
            enabled=True,
        )
    )

    visible = await service.list_artifacts("file_001", _ctx("user_123"))
    assert len(visible) == 1

    await db.create(
        model="filePermissions",
        data={
            "permissionId": "perm_001",
            "fileId": "file_001",
            "userId": "user_456",
            "tenantId": None,
            "canRead": True,
        },
    )
    visible_via_grant = await service.list_artifacts("file_001", _ctx("user_456"))
    assert len(visible_via_grant) == 1

    with pytest.raises(Exception) as exc_forbidden:
        await service.list_artifacts("file_001", _ctx("user_999"))
    assert getattr(exc_forbidden.value, "code", "") == "FILEFN_FORBIDDEN"

    descriptor = await service.get_artifact_download_url("art_001", _ctx("user_123"), file_id="file_001")
    assert descriptor["url"] == "/proxy/files/file_001/artifacts/art_001/download"
    assert not descriptor["url"].startswith("proxy://")

    with pytest.raises(Exception) as exc_binding:
        await service.get_artifact_download_url("art_001", _ctx("user_123"), file_id="file_999")
    assert getattr(exc_binding.value, "code", "") == "FILEFN_NOT_FOUND"


@pytest.mark.asyncio
async def test_processing_events_preserve_request_id() -> None:
    db = FakeDB()
    storage = FakeStorage()
    storage.objects["org_123/user_123/file_001/ver_001-a.png"] = b"abc"
    events = create_event_emitter()
    seen: List[Any] = []
    events.on("processing.started", seen.append)
    events.on("processing.completed", seen.append)

    service = create_processing_service(
        ProcessingServiceConfig(
            db=db,
            storage=storage,
            events=events,
            processors=[ThumbnailLikeProcessor()],
            namespace="filefn",
            enabled=True,
        )
    )

    await service.run_processing(
        ProcessorInput(
            fileId="file_001",
            versionId="ver_001",
            storageKey="org_123/user_123/file_001/ver_001-a.png",
            mimeType="image/png",
            size=3,
            fileName="a.png",
            tenantId="org_123",
        ),
        _ctx("user_123"),
    )

    assert len(seen) == 1
    assert seen[0].requestId == "req_001"


@pytest.mark.asyncio
async def test_processing_routes_artifacts_to_artifact_storage_target() -> None:
    db = FakeDB()
    now = datetime.now(timezone.utc).isoformat()
    await db.create(
        model="files",
        data={
            "fileId": "file_002",
            "currentVersionId": "ver_002",
            "ownerId": "user_123",
            "tenantId": "org_123",
            "visibility": "private",
            "policy": "artifact-offload",
            "mimeType": "image/png",
            "size": 3,
            "name": "b.png",
            "metadata": {},
            "createdAt": now,
            "updatedAt": now,
        },
    )

    durable = FakeStorage()
    durable.name = "durable"
    durable.objects["uploads/file_002/ver_002-b.png"] = b"abc"
    temporary = FakeStorage()
    temporary.name = "temporary"
    storage = create_routed_storage_adapter(
        {"durable": durable, "temporary": temporary},
        default_target="durable",
    )

    service = create_processing_service(
        ProcessingServiceConfig(
            db=db,
            storage=storage,
            policies=create_policy_registry(
                [
                    Policy(
                        name="artifact-offload",
                        contentTypes=["image/png"],
                        storageTarget="durable",
                        artifactStorageTarget="temporary",
                    )
                ]
            ),
            events=create_event_emitter(),
            processors=[ThumbnailLikeProcessor()],
            namespace="filefn",
            enabled=True,
        )
    )

    result = await service.run_processing(
        ProcessorInput(
            fileId="file_002",
            versionId="ver_002",
            storageKey="uploads/file_002/ver_002-b.png",
            mimeType="image/png",
            size=3,
            fileName="b.png",
            tenantId="org_123",
        ),
        _ctx("user_123"),
    )

    assert result["artifactsCreated"] == 1
    assert len(durable.put_calls) == 0
    assert len(temporary.put_calls) == 1
    assert temporary.put_calls[0]["key"].endswith(".thumb.png")


@pytest.mark.asyncio
async def test_pdf_preview_processor_emits_canonical_artifact_kinds() -> None:
    processor = create_pdf_preview_processor()
    fake_pdf = b"%PDF-bad-but-usable-for-placeholder"

    async def get_pdf() -> bytes:
        return fake_pdf

    result = await processor.process(
        ProcessorInput(
            fileId="file_pdf_001",
            versionId="ver_pdf_001",
            storageKey="uploads/file_pdf_001/ver_pdf_001-report.pdf",
            mimeType="application/pdf",
            size=len(fake_pdf),
            fileName="report.pdf",
            tenantId="org_123",
        ),
        get_pdf,
    )

    assert result.success is True
    assert [artifact.kind for artifact in result.artifacts] == [
        "pdf-preview-page-1-small",
        "pdf-preview-page-1-medium",
        "pdf-preview-page-1-large",
    ]
    assert all(artifact.mimeType == "image/png" for artifact in result.artifacts)
    assert all(artifact.metadata and artifact.metadata.get("pageNumber") == 1 for artifact in result.artifacts)
    assert all(artifact.metadata and artifact.metadata.get("renderMode") for artifact in result.artifacts)


@pytest.mark.asyncio
async def test_pdf_preview_processor_respects_configured_output_format_for_placeholder_previews() -> None:
    processor = create_pdf_preview_processor(PdfPreviewConfig(format="jpeg", quality=70))

    async def get_pdf() -> bytes:
        return b"%PDF-placeholder"

    result = await processor.process(
        ProcessorInput(
            fileId="file_pdf_fmt",
            versionId="ver_pdf_fmt",
            storageKey="uploads/file_pdf_fmt/ver_pdf_fmt-report.pdf",
            mimeType="application/pdf",
            size=16,
            fileName="report.pdf",
            tenantId="org_123",
        ),
        get_pdf,
    )

    assert result.success is True
    for artifact in result.artifacts:
        _assert_image_artifact_format_consistency(artifact)


@pytest.mark.asyncio
async def test_thumbnail_processor_keeps_canonical_reserved_kinds() -> None:
    processor = create_thumbnail_processor()
    not_a_real_image = b"\x89PNG\r\nplaceholder"

    async def get_image() -> bytes:
        return not_a_real_image

    result = await processor.process(
        ProcessorInput(
            fileId="file_img_001",
            versionId="ver_img_001",
            storageKey="uploads/file_img_001/ver_img_001-image.png",
            mimeType="image/png",
            size=len(not_a_real_image),
            fileName="image.png",
            tenantId="org_123",
        ),
        get_image,
    )

    assert result.success is True
    assert [artifact.kind for artifact in result.artifacts] == [
        "thumbnail-small",
        "thumbnail-medium",
        "thumbnail-large",
    ]
    assert all(artifact.metadata and artifact.metadata.get("renderMode") for artifact in result.artifacts)


@pytest.mark.asyncio
async def test_thumbnail_placeholder_respects_configured_output_format() -> None:
    processor = create_thumbnail_processor(ThumbnailConfig(format="webp", quality=75))

    async def get_image() -> bytes:
        return b"\x89PNG\r\nplaceholder"

    result = await processor.process(
        ProcessorInput(
            fileId="file_thumb_fmt",
            versionId="ver_thumb_fmt",
            storageKey="uploads/file_thumb_fmt/ver_thumb_fmt-image.png",
            mimeType="image/png",
            size=16,
            fileName="image.png",
            tenantId="org_123",
        ),
        get_image,
    )

    assert result.success is True
    for artifact in result.artifacts:
        _assert_image_artifact_format_consistency(artifact)


@pytest.mark.asyncio
async def test_image_transform_processor_applies_real_resize_operations() -> None:
    processor = create_image_transform_processor(
        ImageTransformConfig(
            operations=[
                ImageTransformOperation(
                    operation="resize",
                    options=ResizeOptions(width=4, height=4),
                    suffix="small",
                )
            ],
            outputFormat="png",
        )
    )

    async def get_image() -> bytes:
        return _make_png()

    result = await processor.process(
        ProcessorInput(
            fileId="file_img_transform",
            versionId="ver_img_transform",
            storageKey="uploads/file_img_transform/ver_img_transform-image.png",
            mimeType="image/png",
            size=16,
            fileName="image.png",
            tenantId="org_123",
        ),
        get_image,
    )

    try:
        import PIL  # noqa: F401
    except Exception:
        assert result.success is False
        assert result.error == "FILEFN_PROCESSING_IMAGE_TRANSFORM_FAILED"
    else:
        assert result.success is True
        assert len(result.artifacts) == 1
        artifact = result.artifacts[0]
        assert artifact.kind == "image-transform"
        assert artifact.mimeType == "image/png"
        assert artifact.storageKey.endswith("-small.png")


@pytest.mark.asyncio
async def test_image_transform_respects_without_enlargement_and_preserves_dotted_parent_paths() -> None:
    processor = create_image_transform_processor(
        ImageTransformConfig(
            operations=[
                ImageTransformOperation(
                    operation="resize",
                    options=ResizeOptions(width=32, height=32, fit="fill", withoutEnlargement=True),
                    suffix="bounded",
                )
            ],
            outputFormat="png",
        )
    )

    async def get_image() -> bytes:
        return _make_png()

    result = await processor.process(
        ProcessorInput(
            fileId="file_img_transform_2",
            versionId="ver_img_transform_2",
            storageKey="uploads/v1.assets/file_img_transform_2/original.image.png",
            mimeType="image/png",
            size=16,
            fileName="image.png",
            tenantId="org_123",
        ),
        get_image,
    )

    try:
        from PIL import Image
    except Exception:
        assert result.success is False
        assert result.error == "FILEFN_PROCESSING_IMAGE_TRANSFORM_FAILED"
    else:
        assert result.success is True
        artifact = result.artifacts[0]
        assert artifact.storageKey == "uploads/v1.assets/file_img_transform_2/original.image-bounded.png"
        with Image.open(io.BytesIO(artifact.data)) as transformed:
            assert transformed.size == (8, 8)


@pytest.mark.asyncio
async def test_image_transform_defaults_to_source_format_when_output_format_is_omitted() -> None:
    processor = create_image_transform_processor(
        ImageTransformConfig(
            operations=[
                ImageTransformOperation(
                    operation="resize",
                    options=ResizeOptions(width=4, height=4),
                    suffix="small",
                )
            ],
        )
    )

    async def get_image() -> bytes:
        return _make_jpeg()

    result = await processor.process(
        ProcessorInput(
            fileId="file_img_transform_3",
            versionId="ver_img_transform_3",
            storageKey="uploads/file_img_transform_3/original.photo.jpg",
            mimeType="image/jpeg",
            size=16,
            fileName="image.jpg",
            tenantId="org_123",
        ),
        get_image,
    )

    try:
        from PIL import Image
    except Exception:
        assert result.success is False
        assert result.error == "FILEFN_PROCESSING_IMAGE_TRANSFORM_FAILED"
    else:
        assert result.success is True
        artifact = result.artifacts[0]
        assert artifact.mimeType == "image/jpeg"
        assert artifact.storageKey.endswith("-small.jpg")
        with Image.open(io.BytesIO(artifact.data)) as transformed:
            assert transformed.format == "JPEG"


@pytest.mark.asyncio
async def test_image_transform_rotate_supports_grayscale_background_fill() -> None:
    processor = create_image_transform_processor(
        ImageTransformConfig(
            operations=[
                ImageTransformOperation(
                    operation="rotate",
                    options=RotateOptions(
                        angle=90,
                        background={"r": 255, "g": 0, "b": 0, "alpha": 255},
                    ),
                    suffix="rotated",
                )
            ],
            outputFormat="png",
        )
    )

    async def get_image() -> bytes:
        from PIL import Image

        image = Image.new("L", (4, 2), 32)
        out = io.BytesIO()
        image.save(out, format="PNG")
        return out.getvalue()

    result = await processor.process(
        ProcessorInput(
            fileId="file_img_transform_4",
            versionId="ver_img_transform_4",
            storageKey="uploads/file_img_transform_4/original.png",
            mimeType="image/png",
            size=8,
            fileName="image.png",
            tenantId="org_123",
        ),
        get_image,
    )

    try:
        from PIL import Image
    except Exception:
        assert result.success is False
        assert result.error == "FILEFN_PROCESSING_IMAGE_TRANSFORM_FAILED"
    else:
        assert result.success is True
        artifact = result.artifacts[0]
        with Image.open(io.BytesIO(artifact.data)) as transformed:
            assert transformed.mode == "L"
            assert transformed.size == (2, 4)


@pytest.mark.asyncio
async def test_image_transform_rejects_multi_frame_inputs() -> None:
    processor = create_image_transform_processor(
        ImageTransformConfig(
            operations=[
                ImageTransformOperation(
                    operation="resize",
                    options=ResizeOptions(width=2, height=2),
                    suffix="small",
                )
            ],
            outputFormat="gif",
        )
    )

    async def get_image() -> bytes:
        return _make_animated_gif()

    result = await processor.process(
        ProcessorInput(
            fileId="file_img_transform_multi",
            versionId="ver_img_transform_multi",
            storageKey="uploads/file_img_transform_multi/original.gif",
            mimeType="image/gif",
            size=16,
            fileName="image.gif",
            tenantId="org_123",
        ),
        get_image,
    )

    try:
        import PIL  # noqa: F401
    except Exception:
        assert result.success is False
        assert result.error == "FILEFN_PROCESSING_IMAGE_TRANSFORM_FAILED"
    else:
        assert result.success is False
        assert result.error == "FILEFN_PROCESSING_IMAGE_TRANSFORM_FAILED"


@pytest.mark.asyncio
async def test_unavailable_processing_factories_fail_closed_instead_of_returning_fake_artifacts() -> None:
    input = ProcessorInput(
        fileId="file_proc_stub",
        versionId="ver_proc_stub",
        storageKey="uploads/file_proc_stub/ver_proc_stub.bin",
        mimeType="image/png",
        size=8,
        fileName="placeholder.png",
        tenantId="org_123",
    )

    async def get_data() -> bytes:
        return b"placeholder"

    ocr = await create_ocr_processor().process(input, get_data)
    video = await create_video_processor().process(
        input.model_copy(update={"mimeType": "video/mp4", "fileName": "placeholder.mp4"}),
        get_data,
    )
    audio = await create_audio_processor().process(
        input.model_copy(update={"mimeType": "audio/mpeg", "fileName": "placeholder.mp3"}),
        get_data,
    )

    assert ocr.success is False
    assert ocr.error == "FILEFN_PROCESSING_OCR_PROVIDER_REQUIRED"
    assert video.success is False
    assert video.error == "FILEFN_PROCESSING_VIDEO_PROVIDER_REQUIRED"
    assert audio.success is False
    assert audio.error == "FILEFN_PROCESSING_AUDIO_PROVIDER_REQUIRED"


@pytest.mark.asyncio
async def test_trigger_processing_retains_background_task_until_completion() -> None:
    gate = asyncio.Event()

    class SlowProcessor:
        name = "slow"
        supportedMimeTypes = ["image/png"]

        async def process(self, input: ProcessorInput, get_data):
            await gate.wait()
            return ProcessorResult(success=True, artifacts=[])

    service = create_processing_service(
        ProcessingServiceConfig(
            db=FakeDB(),
            storage=FakeStorage(),
            events=create_event_emitter(),
            processors=[SlowProcessor()],
            namespace="filefn",
            enabled=True,
        )
    )

    result = await service.trigger_processing(
        {
            "fileId": "file_slow",
            "versionId": "ver_slow",
            "storageKey": "uploads/file_slow/ver_slow.png",
            "mimeType": "image/png",
            "size": 3,
            "fileName": "slow.png",
            "tenantId": "org_123",
        },
        _ctx("user_123"),
    )

    assert result["enqueued"] is False
    assert len(service._background_tasks) == 1

    gate.set()
    await asyncio.gather(*list(service._background_tasks))
    assert len(service._background_tasks) == 0
