from typing import Dict, List, Optional

from pydantic import BaseModel


class FieldSchema(BaseModel):
    type: str
    required: bool = False
    unique: bool = False

class IndexSchema(BaseModel):
    name: str
    fields: List[str]
    unique: bool = False

class ConstraintSchema(BaseModel):
    name: str
    type: str
    fields: List[str]

class TableSchema(BaseModel):
    modelName: str
    fields: Dict[str, FieldSchema]
    indexes: List[IndexSchema] = []
    constraints: List[ConstraintSchema] = []

class SchemaResult(BaseModel):
    version: int
    schemas: List[TableSchema]

class FileFnSchemaOptions(BaseModel):
    namespace: str = "filefn"

def get_schema(options: Optional[FileFnSchemaOptions] = None) -> SchemaResult:
    options = options or FileFnSchemaOptions()
    ns = options.namespace

    files = TableSchema(
        modelName='files',
        fields={
            'fileId': FieldSchema(type='string', required=True, unique=True),
            'currentVersionId': FieldSchema(type='string', required=True),
            'ownerId': FieldSchema(type='string', required=True),
            'tenantId': FieldSchema(type='string', required=False),
            'visibility': FieldSchema(type='string', required=True),
            'policy': FieldSchema(type='string', required=True),
            'mimeType': FieldSchema(type='string', required=True),
            'size': FieldSchema(type='number', required=True),
            'name': FieldSchema(type='string', required=True),
            'metadata': FieldSchema(type='json', required=False),
            'createdAt': FieldSchema(type='string', required=True),
            'updatedAt': FieldSchema(type='string', required=True),
        },
        indexes=[
            IndexSchema(name=f'{ns}_files_owner_idx', fields=['ownerId']),
            IndexSchema(name=f'{ns}_files_tenant_idx', fields=['tenantId']),
        ]
    )

    file_versions = TableSchema(
        modelName='fileVersions',
        fields={
            'versionId': FieldSchema(type='string', required=True, unique=True),
            'fileId': FieldSchema(type='string', required=True),
            'storageKey': FieldSchema(type='string', required=True),
            'mimeType': FieldSchema(type='string', required=True),
            'size': FieldSchema(type='number', required=True),
            'checksumSha256Base64': FieldSchema(type='string', required=False),
            'tenantId': FieldSchema(type='string', required=False),
            'createdAt': FieldSchema(type='string', required=True),
        },
        indexes=[
            IndexSchema(name=f'{ns}_versions_file_idx', fields=['fileId']),
            IndexSchema(name=f'{ns}_versions_checksum_idx', fields=['checksumSha256Base64', 'tenantId']),
        ]
    )

    upload_sessions = TableSchema(
        modelName='uploadSessions',
        fields={
            'uploadSessionId': FieldSchema(type='string', required=True, unique=True),
            'status': FieldSchema(type='string', required=True),
            'policy': FieldSchema(type='string', required=True),
            'fileId': FieldSchema(type='string', required=False),
            'fileName': FieldSchema(type='string', required=True),
            'mimeType': FieldSchema(type='string', required=True),
            'size': FieldSchema(type='number', required=True),
            'uploadMode': FieldSchema(type='string', required=True),
            'chunkSizeBytes': FieldSchema(type='number', required=True),
            'totalParts': FieldSchema(type='number', required=True),
            'storageKey': FieldSchema(type='string', required=True),
            'storageUploadId': FieldSchema(type='string', required=False),
            'ownerId': FieldSchema(type='string', required=True),
            'tenantId': FieldSchema(type='string', required=False),
            'metadata': FieldSchema(type='json', required=False),
            'idempotencyKey': FieldSchema(type='string', required=False),
            'idempotencyPayloadHash': FieldSchema(type='string', required=False),
            'completionVersionId': FieldSchema(type='string', required=False),
            'uploadSessionToken': FieldSchema(type='string', required=False),
            'sessionTokenHash': FieldSchema(type='string', required=False),
            'expiresAt': FieldSchema(type='string', required=True),
            'createdAt': FieldSchema(type='string', required=True),
        },
        indexes=[
            IndexSchema(name=f'{ns}_sessions_idem_idx', fields=['idempotencyKey'], unique=True),
            IndexSchema(name=f'{ns}_sessions_expires_idx', fields=['expiresAt']),
        ]
    )

    upload_parts = TableSchema(
        modelName='uploadParts',
        fields={
            'uploadSessionId': FieldSchema(type='string', required=True),
            'partNumber': FieldSchema(type='number', required=True),
            'etag': FieldSchema(type='string', required=True),
            'size': FieldSchema(type='number', required=True),
            'checksumSha256Base64': FieldSchema(type='string', required=False),
        },
        indexes=[
            IndexSchema(name=f'{ns}_parts_session_idx', fields=['uploadSessionId']),
        ],
        constraints=[
            ConstraintSchema(name=f'{ns}_parts_unique', type='unique', fields=['uploadSessionId', 'partNumber']),
        ]
    )

    file_permissions = TableSchema(
        modelName='filePermissions',
        fields={
            'permissionId': FieldSchema(type='string', required=True, unique=True),
            'fileId': FieldSchema(type='string', required=True),
            'userId': FieldSchema(type='string', required=False),
            'role': FieldSchema(type='string', required=False),
            'tenantId': FieldSchema(type='string', required=False),
            'canRead': FieldSchema(type='boolean', required=True),
            'canWrite': FieldSchema(type='boolean', required=True),
            'canDelete': FieldSchema(type='boolean', required=True),
            'canShare': FieldSchema(type='boolean', required=True),
            'expiresAt': FieldSchema(type='string', required=False),
            'createdAt': FieldSchema(type='string', required=True),
        },
        indexes=[
            IndexSchema(name=f'{ns}_perms_file_idx', fields=['fileId']),
            IndexSchema(name=f'{ns}_perms_user_idx', fields=['userId']),
        ]
    )

    file_shares = TableSchema(
        modelName='fileShares',
        fields={
            'tokenHash': FieldSchema(type='string', required=True, unique=True),
            'fileId': FieldSchema(type='string', required=True),
            'versionId': FieldSchema(type='string', required=False),
            'expiresAt': FieldSchema(type='string', required=False),
            'requiresAuth': FieldSchema(type='boolean', required=True),
            'maxDownloads': FieldSchema(type='number', required=False),
            'downloads': FieldSchema(type='number', required=True),
            'createdAt': FieldSchema(type='string', required=True),
            'revokedAt': FieldSchema(type='string', required=False),
        },
        indexes=[
            IndexSchema(name=f'{ns}_shares_file_idx', fields=['fileId']),
        ]
    )

    file_artifacts = TableSchema(
        modelName='fileArtifacts',
        fields={
            'artifactId': FieldSchema(type='string', required=True, unique=True),
            'fileId': FieldSchema(type='string', required=True),
            'versionId': FieldSchema(type='string', required=True),
            'kind': FieldSchema(type='string', required=True),
            'storageKey': FieldSchema(type='string', required=True),
            'mimeType': FieldSchema(type='string', required=True),
            'size': FieldSchema(type='number', required=False),
            'metadata': FieldSchema(type='json', required=False),
            'createdAt': FieldSchema(type='string', required=True),
        },
        indexes=[
            IndexSchema(name=f'{ns}_artifacts_file_idx', fields=['fileId']),
            IndexSchema(name=f'{ns}_artifacts_version_idx', fields=['versionId']),
        ]
    )

    return SchemaResult(
        version=1,
        schemas=[files, file_versions, upload_sessions, upload_parts, file_permissions, file_shares, file_artifacts]
    )

def get_schema_map(options: Optional[FileFnSchemaOptions] = None) -> Dict[str, TableSchema]:
    result = get_schema(options)
    return {s.modelName: s for s in result.schemas}
