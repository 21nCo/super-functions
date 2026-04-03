import asyncio
from datetime import datetime, timezone
import secrets
from typing import Any, Callable, Dict, List, Optional, Protocol, Set

from pydantic import BaseModel

from .. import errors
from ..events import (
    FileFnEventEmitter,
    ProcessingCompletedEvent,
    ProcessingFailedEvent,
    ProcessingStartedEvent,
)
from ..models import FileProviderContext, FileRecord, Visibility
from ..policies import resolve_artifact_storage_target, resolve_storage_target
from ..routed_storage import get_storage_capabilities


class ProcessorInput(BaseModel):
    fileId: str
    versionId: str
    storageKey: str
    mimeType: str
    size: int
    fileName: str
    tenantId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ProcessorOutputArtifact(BaseModel):
    kind: str
    data: bytes
    mimeType: str
    storageKey: str
    metadata: Optional[Dict[str, Any]] = None


class ProcessorResult(BaseModel):
    success: bool
    artifacts: List[ProcessorOutputArtifact]
    error: Optional[str] = None


class Processor(Protocol):
    name: str
    supportedMimeTypes: List[str]

    async def process(self, input: ProcessorInput, get_data: Callable[[], Any]) -> ProcessorResult: ...


class FlowFnQueue(Protocol):
    async def add(self, job: Any) -> Dict[str, Any]: ...


class FlowFnProvider(Protocol):
    def get_queue(self, name: str) -> Optional[FlowFnQueue]: ...


class ProcessingServiceConfig(BaseModel):
    db: Any
    storage: Any
    policies: Optional[Any] = None
    events: FileFnEventEmitter
    processors: List[Any] = []
    flow_fn: Optional[Any] = None
    namespace: str = "filefn"
    enabled: bool = True

    class Config:
        arbitrary_types_allowed = True


class FileArtifactRecord(BaseModel):
    artifactId: str
    fileId: str
    versionId: str
    kind: str
    storageKey: str
    mimeType: str
    size: int
    metadata: Optional[Dict[str, Any]] = None
    createdAt: str


def _generate_id() -> str:
    return f"art_{secrets.token_urlsafe(12)}"


def _supports_processor(processor: Processor, mime_type: str) -> bool:
    if "*/*" in processor.supportedMimeTypes:
        return True
    return mime_type in processor.supportedMimeTypes


def _build_processing_idempotency_key(file_id: str, version_id: str, processors: List[Processor]) -> str:
    processor_key = ",".join(sorted(processor.name for processor in processors))
    return f"processing:{file_id}:{version_id}:{processor_key}"


class ProcessingService:
    def __init__(self, config: ProcessingServiceConfig):
        self.db = config.db
        self.storage = config.storage
        self.policies = config.policies
        self.events = config.events
        self.processors = config.processors
        self.flow_fn = config.flow_fn
        self.namespace = config.namespace
        self.enabled = config.enabled
        self.queue_name = "filefn.processing"
        self._background_tasks: Set[asyncio.Task[Any]] = set()

    def _file_storage_target(self, policy_name: Optional[str]) -> str:
        policy = self.policies.get(policy_name) if (self.policies and policy_name) else None
        return resolve_storage_target(policy)

    def _artifact_storage_target(self, policy_name: Optional[str]) -> str:
        policy = self.policies.get(policy_name) if (self.policies and policy_name) else None
        return resolve_artifact_storage_target(policy)

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
            if (
                grant.get("principalId") == ctx.principalId
                or grant.get("userId") == ctx.principalId
                or (grant.get("tenantId") and grant.get("tenantId") == ctx.tenantId)
            ):
                readable.add(grant["fileId"])
        return readable

    def is_enabled(self) -> bool:
        return self.enabled and len(self.processors) > 0

    async def trigger_processing(self, input: Dict[str, Any], ctx: FileProviderContext) -> Dict[str, Any]:
        if not self.enabled or not self.processors:
            return {"enqueued": False}

        self.events.emit(
            "processing.started",
            ProcessingStartedEvent(
                timestamp=datetime.now(timezone.utc).isoformat(),
                requestId=ctx.requestId,
                fileId=input["fileId"],
                versionId=input["versionId"],
            ),
        )

        if self.flow_fn:
            queue = self.flow_fn.get_queue(self.queue_name)
            if queue:
                try:
                    idempotency_key = _build_processing_idempotency_key(
                        input["fileId"],
                        input["versionId"],
                        self.processors,
                    )
                    result = await queue.add(
                        {
                            "fileId": input["fileId"],
                            "versionId": input["versionId"],
                            "storageKey": input["storageKey"],
                            "mimeType": input["mimeType"],
                            "size": input["size"],
                            "fileName": input["fileName"],
                            "tenantId": input.get("tenantId"),
                            "idempotencyKey": idempotency_key,
                        }
                    )
                    return {"enqueued": True, "jobId": result.get("jobId")}
                except Exception as exc:
                    raise errors.processing_enqueue_failed() from exc

        task = asyncio.create_task(self._safe_run_processing(ProcessorInput(**input), ctx))
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return {"enqueued": False}

    async def _safe_run_processing(self, input: ProcessorInput, ctx: FileProviderContext) -> None:
        try:
            await self.run_processing(input, ctx)
        except Exception as exc:
            self.events.emit(
                "processing.failed",
                ProcessingFailedEvent(
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    requestId=ctx.requestId,
                    fileId=input.fileId,
                    versionId=input.versionId,
                    error=str(exc),
                ),
            )

    async def run_processing(self, input: ProcessorInput, ctx: FileProviderContext) -> Dict[str, Any]:
        applicable_processors = [p for p in self.processors if _supports_processor(p, input.mimeType)]
        if not applicable_processors:
            return {"artifactsCreated": 0, "errors": []}

        file_data = await self.db.find_one(
            model="files",
            where=[{"field": "fileId", "operator": "eq", "value": input.fileId}],
            namespace=self.namespace,
        )
        policy_name = file_data.get("policy") if file_data else None
        file_storage_target = self._file_storage_target(policy_name)
        artifact_storage_target = self._artifact_storage_target(policy_name)

        data_cache: Optional[bytes] = None

        async def get_data() -> bytes:
            nonlocal data_cache
            if data_cache is not None:
                return data_cache

            stream = await self.storage.open_download_stream(key=input.storageKey, target=file_storage_target)
            chunks: List[bytes] = []
            async for chunk in stream:
                chunks.append(chunk)
            data_cache = b"".join(chunks)
            return data_cache

        processing_errors: List[str] = []
        artifacts_created = 0

        for processor in applicable_processors:
            try:
                result = await processor.process(input, get_data)
                if not result.success:
                    if result.error:
                        processing_errors.append(f"{processor.name}: {result.error}")
                    continue

                for artifact in result.artifacts:
                    await self.storage.put_object(
                        key=artifact.storageKey,
                        data=artifact.data,
                        metadata={"contentType": artifact.mimeType},
                        target=artifact_storage_target,
                    )

                    existing_artifact_data = await self.db.find_one(
                        model="fileArtifacts",
                        where=[
                            {"field": "fileId", "operator": "eq", "value": input.fileId},
                            {"field": "versionId", "operator": "eq", "value": input.versionId},
                            {"field": "kind", "operator": "eq", "value": artifact.kind},
                        ],
                        namespace=self.namespace,
                    )

                    if existing_artifact_data:
                        await self.db.update(
                            model="fileArtifacts",
                            where=[
                                {
                                    "field": "artifactId",
                                    "operator": "eq",
                                    "value": existing_artifact_data["artifactId"],
                                }
                            ],
                            data={
                                "storageKey": artifact.storageKey,
                                "mimeType": artifact.mimeType,
                                "size": len(artifact.data),
                                "metadata": artifact.metadata or {},
                            },
                            namespace=self.namespace,
                        )
                    else:
                        await self.db.create(
                            model="fileArtifacts",
                            data={
                                "artifactId": _generate_id(),
                                "fileId": input.fileId,
                                "versionId": input.versionId,
                                "kind": artifact.kind,
                                "storageKey": artifact.storageKey,
                                "mimeType": artifact.mimeType,
                                "size": len(artifact.data),
                                "metadata": artifact.metadata or {},
                                "createdAt": datetime.now(timezone.utc).isoformat(),
                            },
                            namespace=self.namespace,
                        )
                    artifacts_created += 1
            except Exception as exc:
                processing_errors.append(f"{processor.name}: {str(exc)}")

        self.events.emit(
            "processing.completed",
            ProcessingCompletedEvent(
                timestamp=datetime.now(timezone.utc).isoformat(),
                requestId=ctx.requestId,
                fileId=input.fileId,
                versionId=input.versionId,
                artifactsCreated=artifacts_created,
            ),
        )

        return {"artifactsCreated": artifacts_created, "errors": processing_errors}

    async def _get_readable_file(self, file_id: str, ctx: FileProviderContext) -> FileRecord:
        file_data = await self.db.find_one(
            model="files",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            namespace=self.namespace,
        )
        if not file_data:
            raise errors.not_found("File")

        file = FileRecord(**file_data)
        if file.visibility == Visibility.PUBLIC:
            return file
        if file.ownerId == ctx.principalId:
            return file
        if file.visibility == Visibility.SHARED and file.tenantId and file.tenantId == ctx.tenantId:
            return file

        grant_file_ids = await self._get_readable_grant_file_ids(ctx)
        if file.fileId in grant_file_ids:
            return file

        raise errors.forbidden()

    async def list_artifacts(self, file_id: str, ctx: FileProviderContext) -> List[Dict[str, Any]]:
        await self._get_readable_file(file_id, ctx)
        artifacts = await self.db.find_many(
            model="fileArtifacts",
            where=[{"field": "fileId", "operator": "eq", "value": file_id}],
            order_by=[{"field": "createdAt", "direction": "desc"}],
            namespace=self.namespace,
        )
        return artifacts

    async def get_artifact_download_url(
        self,
        artifact_id: str,
        ctx: FileProviderContext,
        file_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        artifact_data = await self.db.find_one(
            model="fileArtifacts",
            where=[{"field": "artifactId", "operator": "eq", "value": artifact_id}],
            namespace=self.namespace,
        )
        if not artifact_data:
            raise errors.not_found("Artifact")

        artifact = FileArtifactRecord(**artifact_data)
        if file_id and artifact.fileId != file_id:
            raise errors.not_found("Artifact")

        file = await self._get_readable_file(artifact.fileId, ctx)
        artifact_storage_target = self._artifact_storage_target(file.policy)

        if hasattr(self.storage, "sign_download_url") and get_storage_capabilities(self.storage, artifact_storage_target).get("signedDownloadUrls"):
            try:
                result = await self.storage.sign_download_url(
                    key=artifact.storageKey,
                    expires_in_seconds=900,
                    target=artifact_storage_target,
                )
                return {"url": result["url"], "headers": result.get("headers")}
            except Exception:
                pass

        return {"url": f"/proxy/files/{artifact.fileId}/artifacts/{artifact.artifactId}/download"}


def create_processing_service(config: ProcessingServiceConfig) -> ProcessingService:
    return ProcessingService(config)
