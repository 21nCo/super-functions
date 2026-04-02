import type { Adapter } from '@superfunctions/db';
import { createHash } from 'node:crypto';
import { type StorageAdapter, type StorageTargetName } from '@superfunctions/storage';
import { resolveStorageTarget, type PolicyRegistry } from '../policies.js';

export interface DeduplicationServiceConfig {
  db: Adapter;
  policies?: Pick<PolicyRegistry, 'get'>;
  namespace?: string;
  enabled?: boolean;
}

export interface FileVersionRecord {
  versionId: string;
  fileId: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksumSha256Base64?: string | null;
  tenantId?: string | null;
  createdAt: string;
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingVersionId?: string;
  existingStorageKey?: string;
  checksumSha256Base64: string;
}

interface FileRecord {
  fileId: string;
  policy: string;
}

export function createDeduplicationService(config: DeduplicationServiceConfig) {
  const { db, policies, namespace = 'filefn', enabled = true } = config;

  async function resolveVersionStorageTarget(version: Pick<FileVersionRecord, 'fileId'>): Promise<string> {
    const file = await db.findOne<FileRecord>({
      model: 'files',
      where: [{ field: 'fileId', operator: 'eq', value: version.fileId }],
      namespace,
    });
    const policy = file ? policies?.get(file.policy) : undefined;
    return resolveStorageTarget(policy ?? {});
  }

  function computeHash(data: Uint8Array): string {
    const hash = createHash('sha256');
    hash.update(data);
    return hash.digest('base64');
  }

  async function computeHashFromStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const hash = createHash('sha256');
    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          hash.update(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return hash.digest('base64');
  }

  async function checkForDuplicate(
    checksumSha256Base64: string,
    tenantId: string | null,
    storageTarget?: StorageTargetName | null,
  ): Promise<DeduplicationResult> {
    if (!enabled) {
      return {
        isDuplicate: false,
        checksumSha256Base64,
      };
    }

    const whereConditions: Array<{
      field: string;
      operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with';
      value: any;
    }> = [{ field: 'checksumSha256Base64', operator: 'eq', value: checksumSha256Base64 }];

    if (tenantId !== null) {
      whereConditions.push({ field: 'tenantId', operator: 'eq', value: tenantId });
    } else {
      whereConditions.push({ field: 'tenantId', operator: 'eq', value: null });
    }

    if (!storageTarget) {
      const existingVersion = await db.findOne<FileVersionRecord>({
        model: 'fileVersions',
        where: whereConditions,
        namespace,
      });

      if (existingVersion) {
        return {
          isDuplicate: true,
          existingVersionId: existingVersion.versionId,
          existingStorageKey: existingVersion.storageKey,
          checksumSha256Base64,
        };
      }

      return {
        isDuplicate: false,
        checksumSha256Base64,
      };
    }

    const existingVersions = await db.findMany<FileVersionRecord>({
      model: 'fileVersions',
      where: whereConditions,
      namespace,
    });

    for (const existingVersion of existingVersions) {
      if (storageTarget) {
        const existingTarget = await resolveVersionStorageTarget(existingVersion);
        if (existingTarget !== storageTarget) {
          continue;
        }
      }

      return {
        isDuplicate: true,
        existingVersionId: existingVersion.versionId,
        existingStorageKey: existingVersion.storageKey,
        checksumSha256Base64,
      };
    }

    return {
      isDuplicate: false,
      checksumSha256Base64,
    };
  }

  return {
    isEnabled(): boolean {
      return enabled;
    },

    /**
     * Computes SHA-256 hash of the provided data.
     * Returns base64-encoded hash.
     */
    computeHash,

    /**
     * Computes SHA-256 hash from a readable stream.
     * Returns base64-encoded hash.
     */
    computeHashFromStream,

    /**
     * Checks if a version with the given hash already exists in the same tenant.
     * Returns deduplication result with existing version info if found.
     */
    checkForDuplicate,

    /**
     * Computes hash from stored content and checks for duplicates.
     * This is used during upload completion.
     */
    async computeAndCheckDuplicate(
      storageKey: string,
      tenantId: string | null,
      storageTargetOrStorage: StorageTargetName | null | Pick<StorageAdapter, 'openDownloadStream'>,
      maybeStorage?: Pick<StorageAdapter, 'openDownloadStream'>
    ): Promise<DeduplicationResult> {
      const storageTarget =
        maybeStorage === undefined
          ? null
          : storageTargetOrStorage as StorageTargetName | null;
      const storage =
        maybeStorage ??
        (storageTargetOrStorage as Pick<StorageAdapter, 'openDownloadStream'>);

      if (!storage.openDownloadStream) {
        throw new Error('Storage adapter does not support streaming downloads required for deduplication');
      }

      const stream = await storage.openDownloadStream({ key: storageKey, target: storageTarget ?? undefined });
      const checksumSha256Base64 = await computeHashFromStream(stream);

      if (!enabled) {
        return {
          isDuplicate: false,
          checksumSha256Base64,
        };
      }

      return checkForDuplicate(checksumSha256Base64, tenantId, storageTarget);
    },

    /**
     * Verifies that a hash matches the content at the given storage key.
     * Used for integrity verification.
     */
    async verifyHash(
      storageKey: string,
      expectedHash: string,
      storage: Pick<StorageAdapter, 'openDownloadStream'>,
      storageTarget?: StorageTargetName | null,
    ): Promise<boolean> {
      if (!storage.openDownloadStream) {
        return false;
      }

      const stream = await storage.openDownloadStream({ key: storageKey, target: storageTarget ?? undefined });
      const actualHash = await computeHashFromStream(stream);

      return actualHash === expectedHash;
    },
  };
}

export type DeduplicationService = ReturnType<typeof createDeduplicationService>;
