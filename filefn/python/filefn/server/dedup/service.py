import hashlib
import base64
from typing import Any, Optional, AsyncGenerator, Dict, Protocol
from pydantic import BaseModel
from superfunctions.db import Adapter

from ..policies import resolve_storage_target

class DeduplicationServiceConfig(BaseModel):
    db: Any # Adapter
    policies: Optional[Any] = None
    namespace: str = 'filefn'
    enabled: bool = True
    
    class Config:
        arbitrary_types_allowed = True

class DeduplicationResult(BaseModel):
    isDuplicate: bool
    existingVersionId: Optional[str] = None
    existingStorageKey: Optional[str] = None
    checksumSha256Base64: str

class DeduplicationService:
    def __init__(self, config: DeduplicationServiceConfig):
        self.db = config.db
        self.policies = config.policies
        self.namespace = config.namespace
        self.enabled = config.enabled

    async def _resolve_version_storage_target(self, file_id: str) -> str:
        file_row = await self.db.find_one(
            model='files',
            where=[{'field': 'fileId', 'operator': 'eq', 'value': file_id}],
            namespace=self.namespace,
        )
        policy_name = file_row.get('policy') if file_row else None
        policy = self.policies.get(policy_name) if (self.policies and policy_name) else None
        return resolve_storage_target(policy)

    def is_enabled(self) -> bool:
        return self.enabled

    def compute_hash(self, data: bytes) -> str:
        sha256 = hashlib.sha256()
        sha256.update(data)
        return base64.b64encode(sha256.digest()).decode('utf-8')

    async def compute_hash_from_stream(self, stream: AsyncGenerator[bytes, None]) -> str:
        sha256 = hashlib.sha256()
        async for chunk in stream:
            sha256.update(chunk)
        return base64.b64encode(sha256.digest()).decode('utf-8')

    async def check_for_duplicate(
        self,
        checksum_sha256_base64: str,
        tenant_id: Optional[str],
        storage_target: Optional[str] = None,
    ) -> DeduplicationResult:
        if not self.enabled:
            return DeduplicationResult(
                isDuplicate=False,
                checksumSha256Base64=checksum_sha256_base64
            )

        where_conditions = [
            {'field': 'checksumSha256Base64', 'operator': 'eq', 'value': checksum_sha256_base64}
        ]

        if tenant_id:
            where_conditions.append({'field': 'tenantId', 'operator': 'eq', 'value': tenant_id})
        else:
             where_conditions.append({'field': 'tenantId', 'operator': 'eq', 'value': None})

        existing_versions = await self.db.find_many(
            model='fileVersions',
            where=where_conditions,
            namespace=self.namespace
        )

        for existing_version in existing_versions:
            if storage_target is not None:
                existing_target = await self._resolve_version_storage_target(existing_version.get('fileId'))
                if existing_target != storage_target:
                    continue
            return DeduplicationResult(
                isDuplicate=True,
                existingVersionId=existing_version.get('versionId'),
                existingStorageKey=existing_version.get('storageKey'),
                checksumSha256Base64=checksum_sha256_base64
            )

        return DeduplicationResult(
            isDuplicate=False,
            checksumSha256Base64=checksum_sha256_base64
        )

    async def compute_and_check_duplicate(
        self,
        storage_key: str,
        tenant_id: Optional[str],
        storage_target: Optional[str],
        storage: Any,
    ) -> DeduplicationResult:
        if not self.enabled:
             return DeduplicationResult(
                isDuplicate=False,
                checksumSha256Base64=''
            )

        if not hasattr(storage, 'open_download_stream'):
            raise Exception('Storage adapter does not support streaming downloads required for deduplication')

        stream = await storage.open_download_stream(key=storage_key, target=storage_target)
        checksum = await self.compute_hash_from_stream(stream)
        
        return await self.check_for_duplicate(checksum, tenant_id, storage_target)

    async def verify_hash(self, storage_key: str, expected_hash: str, storage: Any, storage_target: Optional[str] = None) -> bool:
        if not hasattr(storage, 'open_download_stream'):
            return False
            
        stream = await storage.open_download_stream(key=storage_key, target=storage_target)
        actual_hash = await self.compute_hash_from_stream(stream)
        
        return actual_hash == expected_hash

def create_deduplication_service(config: DeduplicationServiceConfig) -> DeduplicationService:
    return DeduplicationService(config)
