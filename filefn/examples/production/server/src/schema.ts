import {
  sql,
} from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// FileFn tables — keys match the filefn model names exactly
// (files, fileVersions, uploadSessions, uploadParts, filePermissions,
//  fileShares, fileArtifacts)
// ---------------------------------------------------------------------------

export const files = pgTable(
  "filefn_files",
  {
    fileId: text("file_id").primaryKey(),
    currentVersionId: text("current_version_id").notNull(),
    ownerId: text("owner_id").notNull(),
    tenantId: text("tenant_id"),
    visibility: text("visibility").notNull(),
    policy: text("policy").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    name: text("name").notNull(),
    metadata: jsonb("metadata"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    ownerIdx: index("filefn_files_owner_idx").on(t.ownerId),
    tenantIdx: index("filefn_files_tenant_idx").on(t.tenantId),
  }),
);

export const fileVersions = pgTable(
  "filefn_file_versions",
  {
    versionId: text("version_id").primaryKey(),
    fileId: text("file_id").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    checksumSha256Base64: text("checksum_sha256_base64"),
    tenantId: text("tenant_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    fileIdx: index("filefn_versions_file_idx").on(t.fileId),
    checksumIdx: index("filefn_versions_checksum_idx").on(
      t.checksumSha256Base64,
      t.tenantId,
    ),
  }),
);

export const uploadSessions = pgTable(
  "filefn_upload_sessions",
  {
    uploadSessionId: text("upload_session_id").primaryKey(),
    status: text("status").notNull(),
    policy: text("policy").notNull(),
    fileId: text("file_id"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    uploadMode: text("upload_mode").notNull(),
    chunkSizeBytes: integer("chunk_size_bytes").notNull(),
    totalParts: integer("total_parts").notNull(),
    storageKey: text("storage_key").notNull(),
    storageUploadId: text("storage_upload_id"),
    ownerId: text("owner_id").notNull(),
    tenantId: text("tenant_id"),
    idempotencyKey: text("idempotency_key"),
    idempotencyPayloadHash: text("idempotency_payload_hash"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    idempotencyIdx: uniqueIndex("filefn_sessions_idem_idx")
      .on(t.ownerId, sql`COALESCE(${t.tenantId}, '')`, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    expiresIdx: index("filefn_sessions_expires_idx").on(t.expiresAt),
  }),
);

export const uploadParts = pgTable(
  "filefn_upload_parts",
  {
    uploadSessionId: text("upload_session_id").notNull(),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
    size: integer("size").notNull(),
    checksumSha256Base64: text("checksum_sha256_base64"),
  },
  (t) => ({
    sessionIdx: index("filefn_parts_session_idx").on(t.uploadSessionId),
    partUnique: unique("filefn_parts_unique").on(t.uploadSessionId, t.partNumber),
  }),
);

export const filePermissions = pgTable(
  "filefn_file_permissions",
  {
    permissionId: text("permission_id").primaryKey(),
    fileId: text("file_id").notNull(),
    userId: text("user_id"),
    role: text("role"),
    tenantId: text("tenant_id"),
    canRead: boolean("can_read").notNull(),
    canWrite: boolean("can_write").notNull(),
    canDelete: boolean("can_delete").notNull(),
    canShare: boolean("can_share").notNull(),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    fileIdx: index("filefn_perms_file_idx").on(t.fileId),
    userIdx: index("filefn_perms_user_idx").on(t.userId),
  }),
);

export const fileShares = pgTable(
  "filefn_file_shares",
  {
    tokenHash: text("token_hash").primaryKey(),
    fileId: text("file_id").notNull(),
    versionId: text("version_id"),
    expiresAt: text("expires_at"),
    requiresAuth: boolean("requires_auth").notNull(),
    maxDownloads: integer("max_downloads"),
    downloads: integer("downloads").notNull().default(0),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => ({
    fileIdx: index("filefn_shares_file_idx").on(t.fileId),
  }),
);

export const fileArtifacts = pgTable(
  "filefn_file_artifacts",
  {
    artifactId: text("artifact_id").primaryKey(),
    fileId: text("file_id").notNull(),
    versionId: text("version_id").notNull(),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size"),
    metadata: jsonb("metadata"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    fileIdx: index("filefn_artifacts_file_idx").on(t.fileId),
    versionIdx: index("filefn_artifacts_version_idx").on(t.versionId),
  }),
);

// Schema version tracking (used by @superfunctions/db)
export const __superfunctions_schema_versions = pgTable(
  "__superfunctions_schema_versions",
  {
    namespace: text("namespace").primaryKey(),
    version: integer("version").notNull(),
    appliedAt: text("applied_at").notNull(),
  },
);

// Export all tables for Drizzle config
export const schema = {
  files,
  fileVersions,
  uploadSessions,
  uploadParts,
  filePermissions,
  fileShares,
  fileArtifacts,
  __superfunctions_schema_versions,
};
