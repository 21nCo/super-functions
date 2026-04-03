from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from enum import Enum

class Visibility(str, Enum):
    PRIVATE = 'private'
    SHARED = 'shared'
    PUBLIC = 'public'

class FileRecord(BaseModel):
    fileId: str
    currentVersionId: str
    ownerId: str
    tenantId: Optional[str] = None
    visibility: Visibility
    policy: str
    mimeType: str
    size: int
    name: str
    metadata: Optional[Dict[str, Any]] = None
    createdAt: str
    updatedAt: str

class FileVersionRecord(BaseModel):
    versionId: str
    fileId: str
    storageKey: str
    mimeType: str
    size: int
    checksumSha256Base64: Optional[str] = None
    tenantId: Optional[str] = None
    createdAt: str

class UploadSessionRecord(BaseModel):
    uploadSessionId: str
    status: str
    policy: str
    fileId: Optional[str] = None
    fileName: str
    mimeType: str
    size: int
    uploadMode: str
    chunkSizeBytes: int
    totalParts: int
    storageKey: str
    storageUploadId: Optional[str] = None
    ownerId: str
    tenantId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    idempotencyKey: Optional[str] = None
    idempotencyPayloadHash: Optional[str] = None
    completionVersionId: Optional[str] = None
    uploadSessionToken: Optional[str] = None
    sessionTokenHash: Optional[str] = None
    expiresAt: str
    createdAt: str

class UploadPartRecord(BaseModel):
    uploadSessionId: str
    partNumber: int
    etag: str
    size: int
    checksumSha256Base64: Optional[str] = None

class FilePermissionRecord(BaseModel):
    permissionId: str
    fileId: str
    userId: Optional[str] = None
    role: Optional[str] = None
    tenantId: Optional[str] = None
    canRead: bool
    canWrite: bool
    canDelete: bool
    canShare: bool
    expiresAt: Optional[str] = None
    createdAt: str

class FileShareRecord(BaseModel):
    tokenHash: str
    fileId: str
    versionId: Optional[str] = None
    expiresAt: Optional[str] = None
    requiresAuth: bool
    maxDownloads: Optional[int] = None
    downloads: int
    createdAt: str
    revokedAt: Optional[str] = None

class FileArtifactRecord(BaseModel):
    artifactId: str
    fileId: str
    versionId: str
    kind: str
    storageKey: str
    mimeType: str
    size: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    createdAt: str

class FileProviderContext(BaseModel):
    principalId: Optional[str] = None
    tenantId: Optional[str] = None
    requestId: Optional[str] = None
