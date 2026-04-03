from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from .events import create_event_emitter
from .policies import Policy, create_nucleus_policies, create_policy_registry
from .routed_storage import create_routed_storage_adapter
from .schema import get_schema


class RateLimitCategoryConfig(BaseModel):
    window_seconds: int = Field(alias="windowSeconds", gt=0)
    max_requests: int = Field(alias="maxRequests", gt=0)

    class Config:
        populate_by_name = True


class RateLimitLimitsConfig(BaseModel):
    upload_init: Optional[RateLimitCategoryConfig] = Field(default=None, alias="uploadInit")
    upload_sign: Optional[RateLimitCategoryConfig] = Field(default=None, alias="uploadSign")
    upload_complete: Optional[RateLimitCategoryConfig] = Field(default=None, alias="uploadComplete")
    download: Optional[RateLimitCategoryConfig] = None
    share_download: Optional[RateLimitCategoryConfig] = Field(default=None, alias="shareDownload")
    artifact_download: Optional[RateLimitCategoryConfig] = Field(default=None, alias="artifactDownload")

    class Config:
        populate_by_name = True


class RateLimitConfig(BaseModel):
    persistence: Optional[Any] = None
    algorithm: Literal["fixed-window", "sliding-window", "token-bucket"] = "fixed-window"
    limits: RateLimitLimitsConfig

    class Config:
        arbitrary_types_allowed = True
        populate_by_name = True


class AuthConfig(BaseModel):
    required: bool = False
    allow_anonymous_uploads: bool = True
    principal_id_field: str = "principalId"
    tenant_id_field: str = "tenantId"


class DedupConfig(BaseModel):
    enabled: bool = False


class ProcessingConfig(BaseModel):
    enabled: bool = True
    processors: List[Any] = Field(default_factory=list)
    flow_fn: Optional[Any] = Field(default=None, alias="flowFn")

    class Config:
        populate_by_name = True


class FileFnConfig(BaseModel):
    db: Any
    storage: Any
    policies: List[Policy] = Field(default_factory=list)
    auth: Optional[AuthConfig] = None
    quota: Optional[Any] = None
    rate_limit: Optional[RateLimitConfig] = None
    logger: Optional[Any] = None
    authorizer: Optional[Any] = None
    namespace: str = "filefn"
    default_chunk_size_bytes: Optional[int] = None
    upload_session_ttl_seconds: Optional[int] = None
    signed_url_ttl_seconds: Optional[int] = None
    dedup: Optional[DedupConfig] = None
    processing: Optional[ProcessingConfig] = None

    class Config:
        arbitrary_types_allowed = True
        populate_by_name = True


class FileFn:
    def __init__(
        self,
        upload_service: Any,
        file_service: Any,
        processing_service: Any,
        grants_service: Any,
        shares_service: Any,
        policy_registry: Any,
        events: Any,
        namespace: str,
    ):
        self.upload_service = upload_service
        self.file_service = file_service
        self.processing_service = processing_service
        self.grants_service = grants_service
        self.shares_service = shares_service
        self.policy_registry = policy_registry
        self.events = events
        self.namespace = namespace

    async def create_upload_session(self, input: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
        from .upload_sessions.service import CreateSessionInput

        return await self.upload_service.create_session(CreateSessionInput(**input), ctx)

    async def get_upload_session_status(self, input: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
        return await self.upload_service.get_session_status(input["uploadSessionId"], ctx)

    async def sign_upload_part(self, input: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
        return await self.upload_service.sign_part(
            input["uploadSessionId"],
            input["partNumber"],
            input["contentLength"],
            ctx,
        )

    async def complete_upload_part(self, input: Dict[str, Any], ctx: Any) -> None:
        await self.upload_service.complete_part(
            input["uploadSessionId"],
            input["partNumber"],
            input["etag"],
            input["size"],
            ctx,
        )

    async def complete_upload_session(self, input: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
        return await self.upload_service.complete_session(input["uploadSessionId"], ctx)

    async def abort_upload_session(self, input: Dict[str, Any], ctx: Any) -> None:
        await self.upload_service.abort_session(input["uploadSessionId"], ctx)

    async def get_file(self, input: Dict[str, Any], ctx: Any) -> Any:
        return await self.file_service.get_file(input["fileId"], ctx, input.get("versionId"))

    async def list_files(self, input: Dict[str, Any], ctx: Any) -> Any:
        return await self.file_service.list_files(ctx, input)

    async def delete_file(self, input: Dict[str, Any], ctx: Any) -> None:
        await self.file_service.delete_file(input["fileId"], ctx)

    async def create_grant(self, input: Dict[str, Any], ctx: Any) -> Any:
        from .authz.grants_service import CreateGrantInput

        return await self.grants_service.create_grant(CreateGrantInput(**input), ctx)

    async def list_grants(self, input: Dict[str, Any], ctx: Any) -> Any:
        return await self.grants_service.list_grants(input["fileId"], ctx)

    async def revoke_grant(self, input: Dict[str, Any], ctx: Any) -> None:
        await self.grants_service.revoke_grant(input["fileId"], input["permissionId"], ctx)

    async def create_share_link(self, input: Dict[str, Any], ctx: Any) -> Any:
        from .shares.service import CreateShareLinkInput

        return await self.shares_service.create_share_link(CreateShareLinkInput(**input), ctx)

    async def download_via_share_link(self, input: Dict[str, Any], ctx: Any) -> Any:
        return await self.shares_service.download_via_share_link(
            input["token"],
            ctx,
            is_authenticated=input.get("isAuthenticated", False),
        )

    async def revoke_share_link(self, input: Dict[str, Any], ctx: Any) -> None:
        await self.shares_service.revoke_share_link(input["fileId"], input["token"], ctx)

    async def list_share_links(self, input: Dict[str, Any], ctx: Any) -> Any:
        return await self.shares_service.list_share_links(input["fileId"], ctx)

    def define_policy(self, name: str, policy: Dict[str, Any]) -> None:
        self.policy_registry.define(name, **policy)

    def get_schema(self) -> Any:
        return get_schema({"namespace": self.namespace})


def _has_configured_route_rate_limits(config: RateLimitLimitsConfig) -> bool:
    return any(
        (
            config.upload_init,
            config.upload_sign,
            config.upload_complete,
            config.download,
            config.share_download,
            config.artifact_download,
        )
    )


def create_file_fn(config: FileFnConfig) -> FileFn:
    from .authz.grants_service import GrantsServiceConfig, create_grants_service
    from .dedup.service import DeduplicationServiceConfig, create_deduplication_service
    from .files.service import FileServiceConfig, create_file_service
    from .processing.service import ProcessingServiceConfig, create_processing_service
    from .shares.service import SharesServiceConfig, create_shares_service
    from .upload_sessions.service import UploadSessionServiceConfig, create_upload_session_service

    policy_registry = create_policy_registry(config.policies)
    events = create_event_emitter()

    namespace = config.namespace
    signed_url_ttl = config.signed_url_ttl_seconds or 900
    upload_ttl = config.upload_session_ttl_seconds or 86400
    chunk_size = config.default_chunk_size_bytes or 8 * 1024 * 1024

    if config.rate_limit and not _has_configured_route_rate_limits(config.rate_limit.limits):
        raise ValueError("RATE_LIMIT_CONFIG_INVALID: Missing route-category limits")

    processing_config = config.processing or ProcessingConfig()
    processing_service = create_processing_service(
        ProcessingServiceConfig(
            db=config.db,
            storage=config.storage,
            policies=policy_registry,
            events=events,
            processors=processing_config.processors,
            flow_fn=processing_config.flow_fn,
            namespace=namespace,
            enabled=processing_config.enabled,
        )
    )

    file_service = create_file_service(
        FileServiceConfig(
            db=config.db,
            storage=config.storage,
            policies=policy_registry,
            events=events,
            logger=config.logger,
            quota=config.quota,
            authorizer=config.authorizer,
            namespace=namespace,
            signed_url_ttl_seconds=signed_url_ttl,
        )
    )

    dedup_enabled = config.dedup.enabled if config.dedup is not None else False
    dedup_service = create_deduplication_service(
        DeduplicationServiceConfig(
            db=config.db,
            policies=policy_registry,
            namespace=namespace,
            enabled=dedup_enabled,
        )
    )

    upload_service = create_upload_session_service(
        UploadSessionServiceConfig(
            db=config.db,
            storage=config.storage,
            policies=policy_registry,
            events=events,
            logger=config.logger,
            quota=config.quota,
            dedup=dedup_service,
            file_write_checker=file_service,
            processing_service=processing_service,
            namespace=namespace,
            allow_anonymous_uploads=(config.auth.allow_anonymous_uploads if config.auth is not None else True),
            default_chunk_size_bytes=chunk_size,
            upload_session_ttl_seconds=upload_ttl,
            signed_url_ttl_seconds=signed_url_ttl,
        )
    )

    grants_service = create_grants_service(
        GrantsServiceConfig(
            db=config.db,
            namespace=namespace,
        )
    )

    shares_service = create_shares_service(
        SharesServiceConfig(
            db=config.db,
            storage=config.storage,
            policies=policy_registry,
            logger=config.logger,
            namespace=namespace,
            signed_url_ttl_seconds=signed_url_ttl,
        )
    )

    return FileFn(
        upload_service=upload_service,
        file_service=file_service,
        processing_service=processing_service,
        grants_service=grants_service,
        shares_service=shares_service,
        policy_registry=policy_registry,
        events=events,
        namespace=namespace,
    )
