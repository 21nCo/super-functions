import type { TableSchema, TableSchemaMap } from '@superfunctions/db';

export interface FileFnSchemaOptions {
  namespace?: string;
}

export function getSchema(options: FileFnSchemaOptions = {}): { version: number; schemas: TableSchema[] } {
  const ns = options.namespace || 'filefn';

  const files: TableSchema = {
    modelName: 'files',
    fields: {
      fileId: { type: 'string', required: true, unique: true },
      currentVersionId: { type: 'string', required: true },
      ownerId: { type: 'string', required: true },
      tenantId: { type: 'string', required: false },
      visibility: { type: 'string', required: true },
      policy: { type: 'string', required: true },
      mimeType: { type: 'string', required: true },
      size: { type: 'number', required: true },
      name: { type: 'string', required: true },
      metadata: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
      updatedAt: { type: 'string', required: true },
    },
    indexes: [
      { name: `${ns}_files_owner_idx`, fields: ['ownerId'] },
      { name: `${ns}_files_tenant_idx`, fields: ['tenantId'] },
    ],
  };

  const fileVersions: TableSchema = {
    modelName: 'fileVersions',
    fields: {
      versionId: { type: 'string', required: true, unique: true },
      fileId: { type: 'string', required: true },
      storageKey: { type: 'string', required: true },
      mimeType: { type: 'string', required: true },
      size: { type: 'number', required: true },
      checksumSha256Base64: { type: 'string', required: false },
      tenantId: { type: 'string', required: false },
      createdAt: { type: 'string', required: true },
    },
    indexes: [
      { name: `${ns}_versions_file_idx`, fields: ['fileId'] },
      { name: `${ns}_versions_checksum_idx`, fields: ['checksumSha256Base64', 'tenantId'] },
    ],
  };

  const uploadSessions: TableSchema = {
    modelName: 'uploadSessions',
    fields: {
      uploadSessionId: { type: 'string', required: true, unique: true },
      status: { type: 'string', required: true },
      policy: { type: 'string', required: true },
      fileId: { type: 'string', required: false },
      fileName: { type: 'string', required: true },
      mimeType: { type: 'string', required: true },
      size: { type: 'number', required: true },
      uploadMode: { type: 'string', required: true },
      chunkSizeBytes: { type: 'number', required: true },
      totalParts: { type: 'number', required: true },
      storageKey: { type: 'string', required: true },
      storageUploadId: { type: 'string', required: false },
      ownerId: { type: 'string', required: true },
      tenantId: { type: 'string', required: false },
      metadata: { type: 'json', required: false },
      idempotencyKey: { type: 'string', required: false },
      idempotencyPayloadHash: { type: 'string', required: false },
      completionVersionId: { type: 'string', required: false },
      uploadSessionToken: { type: 'string', required: false },
      uploadSessionTokenHash: { type: 'string', required: false },
      expiresAt: { type: 'string', required: true },
      createdAt: { type: 'string', required: true },
    },
    indexes: [
      { name: `${ns}_sessions_idem_idx`, fields: ['idempotencyKey'], unique: true },
      { name: `${ns}_sessions_expires_idx`, fields: ['expiresAt'] },
    ],
  };

  const uploadParts: TableSchema = {
    modelName: 'uploadParts',
    fields: {
      uploadSessionId: { type: 'string', required: true },
      partNumber: { type: 'number', required: true },
      etag: { type: 'string', required: true },
      size: { type: 'number', required: true },
      checksumSha256Base64: { type: 'string', required: false },
    },
    indexes: [
      { name: `${ns}_parts_session_idx`, fields: ['uploadSessionId'] },
    ],
    constraints: [
      { name: `${ns}_parts_unique`, type: 'unique', fields: ['uploadSessionId', 'partNumber'] },
    ],
  };

  const filePermissions: TableSchema = {
    modelName: 'filePermissions',
    fields: {
      permissionId: { type: 'string', required: true, unique: true },
      fileId: { type: 'string', required: true },
      userId: { type: 'string', required: false },
      role: { type: 'string', required: false },
      tenantId: { type: 'string', required: false },
      canRead: { type: 'boolean', required: true },
      canWrite: { type: 'boolean', required: true },
      canDelete: { type: 'boolean', required: true },
      canShare: { type: 'boolean', required: true },
      expiresAt: { type: 'string', required: false },
      createdAt: { type: 'string', required: true },
    },
    indexes: [
      { name: `${ns}_perms_file_idx`, fields: ['fileId'] },
      { name: `${ns}_perms_user_idx`, fields: ['userId'] },
    ],
  };

  const fileShares: TableSchema = {
    modelName: 'fileShares',
    fields: {
      tokenHash: { type: 'string', required: true, unique: true },
      fileId: { type: 'string', required: true },
      versionId: { type: 'string', required: false },
      expiresAt: { type: 'string', required: false },
      requiresAuth: { type: 'boolean', required: true },
      maxDownloads: { type: 'number', required: false },
      downloads: { type: 'number', required: true },
      createdAt: { type: 'string', required: true },
      revokedAt: { type: 'string', required: false },
    },
    indexes: [
      { name: `${ns}_shares_file_idx`, fields: ['fileId'] },
    ],
  };

  const fileArtifacts: TableSchema = {
    modelName: 'fileArtifacts',
    fields: {
      artifactId: { type: 'string', required: true, unique: true },
      fileId: { type: 'string', required: true },
      versionId: { type: 'string', required: true },
      kind: { type: 'string', required: true },
      storageKey: { type: 'string', required: true },
      mimeType: { type: 'string', required: true },
      size: { type: 'number', required: false },
      metadata: { type: 'json', required: false },
      createdAt: { type: 'string', required: true },
    },
    indexes: [
      { name: `${ns}_artifacts_file_idx`, fields: ['fileId'] },
      { name: `${ns}_artifacts_version_idx`, fields: ['versionId'] },
    ],
  };

  return {
    version: 1,
    schemas: [files, fileVersions, uploadSessions, uploadParts, filePermissions, fileShares, fileArtifacts],
  };
}

export function getSchemaMap(options: FileFnSchemaOptions = {}): TableSchemaMap {
  const { schemas } = getSchema(options);
  return Object.fromEntries(schemas.map(s => [s.modelName, s]));
}
