import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from pydantic import BaseModel

from .. import errors
from ..models import FilePermissionRecord, FileProviderContext, FileRecord


class CreateGrantInput(BaseModel):
    fileId: str
    userId: Optional[str] = None
    role: Optional[str] = None
    tenantId: Optional[str] = None
    canRead: Optional[bool] = None
    canWrite: Optional[bool] = None
    canDelete: Optional[bool] = None
    canShare: Optional[bool] = None
    expiresAt: Optional[str] = None

class GrantsServiceConfig(BaseModel):
    db: Any # Adapter
    namespace: str = 'filefn'

    class Config:
        arbitrary_types_allowed = True

class GrantsService:
    def __init__(self, config: GrantsServiceConfig):
        self.db = config.db
        self.namespace = config.namespace

    async def _get_file(self, file_id: str) -> Optional[FileRecord]:
        data = await self.db.find_one(
            model='files',
            where=[{'field': 'fileId', 'operator': 'eq', 'value': file_id}],
            namespace=self.namespace
        )
        return FileRecord(**data) if data else None

    async def _can_manage_permissions(self, file: FileRecord, ctx: FileProviderContext) -> bool:
        return file.ownerId == ctx.principalId

    async def create_grant(self, input: CreateGrantInput, ctx: FileProviderContext) -> FilePermissionRecord:
        file = await self._get_file(input.fileId)
        if not file:
            raise errors.not_found('File')

        if not await self._can_manage_permissions(file, ctx):
            raise errors.forbidden()

        if not input.userId and not input.role and not input.tenantId:
            raise errors.FileFnError('FILEFN_INVALID_GRANT', 'Grant must specify userId, role, or tenantId', 400)

        permission = FilePermissionRecord(
            permissionId=str(uuid.uuid4()),
            fileId=input.fileId,
            userId=input.userId,
            role=input.role,
            tenantId=input.tenantId,
            canRead=input.canRead if input.canRead is not None else True,
            canWrite=input.canWrite if input.canWrite is not None else False,
            canDelete=input.canDelete if input.canDelete is not None else False,
            canShare=input.canShare if input.canShare is not None else False,
            expiresAt=input.expiresAt,
            createdAt=datetime.now(timezone.utc).isoformat()
        )

        await self.db.create(
            model='filePermissions',
            data=permission.model_dump(),
            namespace=self.namespace
        )

        return permission

    async def list_grants(self, file_id: str, ctx: FileProviderContext) -> List[FilePermissionRecord]:
        file = await self._get_file(file_id)
        if not file:
            raise errors.not_found('File')

        if not await self._can_manage_permissions(file, ctx):
            raise errors.forbidden()

        data = await self.db.find_many(
            model='filePermissions',
            where=[{'field': 'fileId', 'operator': 'eq', 'value': file_id}],
            namespace=self.namespace
        )
        return [FilePermissionRecord(**p) for p in data]

    async def revoke_grant(self, file_id: str, permission_id: str, ctx: FileProviderContext) -> None:
        file = await self._get_file(file_id)
        if not file:
            raise errors.not_found('File')

        if not await self._can_manage_permissions(file, ctx):
            raise errors.forbidden()

        permission = await self.db.find_one(
            model='filePermissions',
            where=[
                {'field': 'permissionId', 'operator': 'eq', 'value': permission_id},
                {'field': 'fileId', 'operator': 'eq', 'value': file_id}
            ],
            namespace=self.namespace
        )

        if not permission:
            raise errors.permission_not_found()

        await self.db.delete(
            model='filePermissions',
            where=[{'field': 'permissionId', 'operator': 'eq', 'value': permission_id}],
            namespace=self.namespace
        )

def create_grants_service(config: GrantsServiceConfig) -> GrantsService:
    return GrantsService(config)
