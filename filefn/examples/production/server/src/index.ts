import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import { createFileFn } from "@filefn/server";
import { createS3StorageAdapter } from "@superfunctions/storage-s3";
import { createThumbnailProcessor } from "@filefn/processing";
import { adapter, db } from "./db.js";
import { config } from "dotenv";

config();

const port = Number(process.env.PORT) || 3001;
const demoMode = process.env.FILEFN_DEMO_MODE === "true";
const allowedOrigins = (process.env.FILEFN_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Storage — S3 (or MinIO/LocalStack via S3_ENDPOINT)
// ---------------------------------------------------------------------------

const storage = createS3StorageAdapter({
  bucket: process.env.S3_BUCKET || "filefn-demo",
  region: process.env.AWS_REGION || "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: !!process.env.S3_ENDPOINT,
});

// ---------------------------------------------------------------------------
// FileFn — all features enabled
// ---------------------------------------------------------------------------

const fileFn = createFileFn({
  db: adapter,
  storage,
  policies: [
    {
      name: "images",
      contentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
      maxSizeBytes: 50 * 1024 * 1024,
      visibility: "public",
    },
    {
      name: "documents",
      contentTypes: [
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      maxSizeBytes: 100 * 1024 * 1024,
      visibility: "private",
    },
    {
      name: "general",
      maxSizeBytes: 200 * 1024 * 1024,
      visibility: "private",
    },
  ],
  auth: {
    required: !demoMode,
    resolveSession: async (_request: Request) => {
      if (demoMode) {
        return {
          principalId: "demo-user",
          tenantId: "demo-org",
        };
      }

      return null;
    },
  },
  processing: {
    enabled: true,
    processors: [createThumbnailProcessor()],
  },
});

// ---------------------------------------------------------------------------
// Events — log activity to console
// ---------------------------------------------------------------------------

fileFn.events.on("file:uploaded", (e: any) => {
  console.log(`[event] file:uploaded — ${e.fileName} (${e.fileId})`);
});

fileFn.events.on("file:deleted", (e: any) => {
  console.log(`[event] file:deleted — ${e.fileId}`);
});

fileFn.events.on("processing.started", (e: any) => {
  console.log(`[event] processing.started — ${e.fileId}`);
});

fileFn.events.on("processing.completed", (e: any) => {
  console.log(
    `[event] processing.completed — ${e.fileId} (${e.artifactsCreated} artifacts)`,
  );
});

fileFn.events.on("processing.failed", (e: any) => {
  console.log(`[event] processing.failed — ${e.fileId}: ${e.error}`);
});

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const app = new Hono();

app.use(
  "*",
  cors({
    origin: demoMode
      ? "*"
      : (origin) => (allowedOrigins.includes(origin) ? origin : ""),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-filefn-client-version",
      "x-request-id",
    ],
  }),
);

// FileFn router — strip /filefn prefix and forward
app.all("/filefn/*", async (c) => {
  const url = new URL(c.req.raw.url);
  const newPath = url.pathname.replace(/^\/filefn/, "") || "/";
  const newUrl = url.origin + newPath + url.search;

  const newReq = new Request(newUrl, {
    method: c.req.method,
    headers: c.req.header() as any,
    body: c.req.raw.body,
    duplex: "half",
  } as any);

  const response = await fileFn.router.handle(newReq);
  if (!response) {
    return c.notFound();
  }
  return response;
});

// Health check
app.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ ok: true, db: "connected" });
  } catch (e: any) {
    return c.json({ ok: false, db: e.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Bootstrap — create tables then start server
// ---------------------------------------------------------------------------

async function bootstrap() {
  // Create tables if they don't exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filefn_files (
      file_id TEXT PRIMARY KEY,
      current_version_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      tenant_id TEXT,
      visibility TEXT NOT NULL,
      policy TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      name TEXT NOT NULL,
      metadata JSONB,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filefn_file_versions (
      version_id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      checksum_sha256_base64 TEXT,
      tenant_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filefn_upload_sessions (
      upload_session_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      policy TEXT NOT NULL,
      file_id TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      upload_mode TEXT NOT NULL,
      chunk_size_bytes INTEGER NOT NULL,
      total_parts INTEGER NOT NULL,
      storage_key TEXT NOT NULL,
      storage_upload_id TEXT,
      owner_id TEXT NOT NULL,
      tenant_id TEXT,
      idempotency_key TEXT,
      idempotency_payload_hash TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filefn_upload_parts (
      upload_session_id TEXT NOT NULL,
      part_number INTEGER NOT NULL,
      etag TEXT NOT NULL,
      size INTEGER NOT NULL,
      checksum_sha256_base64 TEXT,
      UNIQUE(upload_session_id, part_number)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filefn_file_permissions (
      permission_id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      user_id TEXT,
      role TEXT,
      tenant_id TEXT,
      can_read BOOLEAN NOT NULL,
      can_write BOOLEAN NOT NULL,
      can_delete BOOLEAN NOT NULL,
      can_share BOOLEAN NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filefn_file_shares (
      token_hash TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      version_id TEXT,
      expires_at TEXT,
      requires_auth BOOLEAN NOT NULL,
      max_downloads INTEGER,
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filefn_file_artifacts (
      artifact_id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      version_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER,
      metadata JSONB,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS __superfunctions_schema_versions (
      namespace TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  // Create indexes (IF NOT EXISTS supported in Postgres 9.5+)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_files_owner_idx ON filefn_files(owner_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_files_tenant_idx ON filefn_files(tenant_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_versions_file_idx ON filefn_file_versions(file_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_versions_checksum_idx ON filefn_file_versions(checksum_sha256_base64, tenant_id)`,
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS filefn_sessions_idem_idx ON filefn_upload_sessions(owner_id, COALESCE(tenant_id, ''), idempotency_key) WHERE idempotency_key IS NOT NULL`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_sessions_expires_idx ON filefn_upload_sessions(expires_at)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_parts_session_idx ON filefn_upload_parts(upload_session_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_perms_file_idx ON filefn_file_permissions(file_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_perms_user_idx ON filefn_file_permissions(user_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_shares_file_idx ON filefn_file_shares(file_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_artifacts_file_idx ON filefn_file_artifacts(file_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS filefn_artifacts_version_idx ON filefn_file_artifacts(version_id)`,
  );

  console.log("Database tables ready");

  serve({ fetch: app.fetch, port });
  console.log(`Server running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
