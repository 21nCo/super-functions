import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

type DemoVersion = {
  versionId: string;
  fileId: string;
  size: number;
  mimeType: string;
  createdAt: string;
  data: Buffer;
};

type DemoFile = {
  fileId: string;
  currentVersionId: string;
  ownerId: string;
  tenantId: string;
  visibility: string;
  policy: string;
  mimeType: string;
  size: number;
  name: string;
  metadata: Record<string, JSONValue>;
  createdAt: string;
  updatedAt: string;
  versions: DemoVersion[];
};

type UploadSession = {
  uploadSessionId: string;
  uploadSessionToken: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  policy: string;
  metadata: Record<string, JSONValue>;
  chunkSizeBytes: number;
  totalParts: number;
  uploadedParts: Set<number>;
  recordedParts: Set<number>;
  partPayloads: Map<number, Buffer>;
  expiresAt: string;
};

const port = Number(process.env.PORT) || 3001;
const files = new Map<string, DemoFile>();
const uploads = new Map<string, UploadSession>();

const policy = {
  name: "public-image",
  contentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  maxSizeBytes: 10 * 1024 * 1024,
  visibility: "public",
};

const server = createServer(async (req, res) => {
  try {
    const requestURL = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
    const method = req.method ?? "GET";
    const fileFnPath = requestURL.pathname.replace(/^\/filefn/, "") || "/";

    if (requestURL.pathname === "/favicon.ico") {
      sendEmpty(res, 204);
      return;
    }

    if (!requestURL.pathname.startsWith("/filefn")) {
      sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "Route not found" });
      return;
    }

    if (method === "GET" && fileFnPath === "/policies") {
      sendEnvelope(res, 200, { policies: [policy] });
      return;
    }

    if (method === "GET" && fileFnPath === "/quota/storage") {
      const current = Array.from(files.values()).reduce((sum, file) => sum + file.size, 0);
      sendEnvelope(res, 200, { current, limit: 50 * 1024 * 1024 });
      return;
    }

    if (method === "GET" && fileFnPath === "/") {
      const limit = Number(requestURL.searchParams.get("limit") ?? "100");
      const summaries = Array.from(files.values())
        .slice(0, Number.isFinite(limit) ? limit : 100)
        .map((file) => ({
          fileId: file.fileId,
          currentVersionId: file.currentVersionId,
          ownerId: file.ownerId,
          tenantId: file.tenantId,
          visibility: file.visibility,
          policy: file.policy,
          mimeType: file.mimeType,
          size: file.size,
          name: file.name,
          metadata: file.metadata,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        }));
      sendEnvelope(res, 200, { files: summaries, nextCursor: null });
      return;
    }

    if (method === "POST" && fileFnPath === "/upload/init") {
      const body = await readJSONBody(req);
      const fileId = asString(body.fileId) ?? `file_${randomID()}`;
      const uploadSessionId = `upl_${randomID()}`;
      const uploadSessionToken = `upls_${randomID()}`;
      const size = asNumber(body.size) ?? 0;
      const session: UploadSession = {
        uploadSessionId,
        uploadSessionToken,
        fileId,
        fileName: asString(body.fileName) ?? "upload.bin",
        mimeType: asString(body.mimeType) ?? "application/octet-stream",
        size,
        policy: asString(body.policy) ?? policy.name,
        metadata: asRecord(body.metadata),
        chunkSizeBytes: Math.max(size, 1),
        totalParts: 1,
        uploadedParts: new Set<number>(),
        recordedParts: new Set<number>(),
        partPayloads: new Map<number, Buffer>(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
      uploads.set(uploadSessionId, session);
      sendEnvelope(res, 200, {
        uploadSessionId,
        uploadSessionToken,
        uploadMode: "multipart-signed-url",
        chunkSizeBytes: session.chunkSizeBytes,
        totalParts: session.totalParts,
        expiresAt: session.expiresAt,
      });
      return;
    }

    const uploadStatusMatch = fileFnPath.match(/^\/upload\/([^/]+)\/status$/);
    if (method === "GET" && uploadStatusMatch) {
      const session = uploads.get(uploadStatusMatch[1]);
      if (!session) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "Upload session not found" });
        return;
      }
      sendEnvelope(res, 200, {
        uploadSessionId: session.uploadSessionId,
        status: session.recordedParts.size === session.totalParts ? "uploaded" : "pending",
        totalParts: session.totalParts,
        recordedParts: Array.from(session.recordedParts.values()).sort((a, b) => a - b),
        uploadedParts: Array.from(session.uploadedParts.values()).sort((a, b) => a - b),
        chunkSizeBytes: session.chunkSizeBytes,
        fileSize: session.size,
        expiresAt: session.expiresAt,
      });
      return;
    }

    const uploadSignMatch = fileFnPath.match(/^\/upload\/([^/]+)\/parts\/(\d+)\/sign$/);
    if (method === "POST" && uploadSignMatch) {
      const session = uploads.get(uploadSignMatch[1]);
      if (!session) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "Upload session not found" });
        return;
      }
      const partNumber = Number(uploadSignMatch[2]);
      const origin = requestOrigin(req);
      sendEnvelope(res, 200, {
        url: `${origin}/filefn/upload/${session.uploadSessionId}/parts/${partNumber}`,
        headers: {
          "content-type": session.mimeType,
        },
        expiresAt: session.expiresAt,
      });
      return;
    }

    const uploadPutMatch = fileFnPath.match(/^\/upload\/([^/]+)\/parts\/(\d+)$/);
    if (method === "PUT" && uploadPutMatch) {
      const session = uploads.get(uploadPutMatch[1]);
      if (!session) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "Upload session not found" });
        return;
      }
      const partNumber = Number(uploadPutMatch[2]);
      session.partPayloads.set(partNumber, await readBody(req));
      session.uploadedParts.add(partNumber);
      res.statusCode = 200;
      res.setHeader("etag", `"etag_${partNumber}_${randomID()}"`);
      res.end();
      return;
    }

    const uploadCompletePartMatch = fileFnPath.match(/^\/upload\/([^/]+)\/parts\/(\d+)\/complete$/);
    if (method === "POST" && uploadCompletePartMatch) {
      const session = uploads.get(uploadCompletePartMatch[1]);
      if (!session) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "Upload session not found" });
        return;
      }
      const partNumber = Number(uploadCompletePartMatch[2]);
      session.recordedParts.add(partNumber);
      sendEnvelope(res, 200, { recorded: true });
      return;
    }

    const uploadCompleteMatch = fileFnPath.match(/^\/upload\/([^/]+)\/complete$/);
    if (method === "POST" && uploadCompleteMatch) {
      const session = uploads.get(uploadCompleteMatch[1]);
      if (!session) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "Upload session not found" });
        return;
      }

      const versionId = `ver_${randomID()}`;
      const now = new Date().toISOString();
      const data = Buffer.concat(Array.from(session.partPayloads.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, payload]) => payload));
      const version: DemoVersion = {
        versionId,
        fileId: session.fileId,
        size: data.length,
        mimeType: session.mimeType,
        createdAt: now,
        data,
      };
      const existing = files.get(session.fileId);
      const createdAt = existing?.createdAt ?? now;
      files.set(session.fileId, {
        fileId: session.fileId,
        currentVersionId: versionId,
        ownerId: "demo-user",
        tenantId: "demo-org",
        visibility: "public",
        policy: session.policy,
        mimeType: session.mimeType,
        size: data.length,
        name: session.fileName,
        metadata: session.metadata,
        createdAt,
        updatedAt: now,
        versions: [...(existing?.versions ?? []), version],
      });
      uploads.delete(session.uploadSessionId);
      sendEnvelope(res, 200, { fileId: session.fileId, versionId });
      return;
    }

    const uploadAbortMatch = fileFnPath.match(/^\/upload\/([^/]+)\/abort$/);
    if (method === "POST" && uploadAbortMatch) {
      uploads.delete(uploadAbortMatch[1]);
      sendEnvelope(res, 200, { aborted: true });
      return;
    }

    const fileVersionsMatch = fileFnPath.match(/^\/([^/]+)\/versions$/);
    if (method === "GET" && fileVersionsMatch) {
      const file = files.get(fileVersionsMatch[1]);
      if (!file) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "File not found" });
        return;
      }
      sendEnvelope(res, 200, {
        versions: file.versions.map((version) => ({
          versionId: version.versionId,
          size: version.size,
          mimeType: version.mimeType,
          createdAt: version.createdAt,
        })),
      });
      return;
    }

    const fileDownloadMatch = fileFnPath.match(/^\/([^/]+)\/download$/);
    if (method === "GET" && fileDownloadMatch) {
      const file = files.get(fileDownloadMatch[1]);
      if (!file) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "File not found" });
        return;
      }
      sendEnvelope(res, 200, {
        url: `${requestOrigin(req)}/filefn/${file.fileId}/blob`,
        headers: {},
      });
      return;
    }

    const fileBlobMatch = fileFnPath.match(/^\/([^/]+)\/blob$/);
    if (method === "GET" && fileBlobMatch) {
      const file = files.get(fileBlobMatch[1]);
      const version = file?.versions.find((item) => item.versionId === file.currentVersionId);
      if (!file || !version) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "File not found" });
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", version.mimeType);
      res.end(version.data);
      return;
    }

    const fileMatch = fileFnPath.match(/^\/([^/]+)$/);
    if (fileMatch) {
      const file = files.get(fileMatch[1]);
      if (!file) {
        sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "File not found" });
        return;
      }

      if (method === "GET") {
        sendEnvelope(res, 200, {
          fileId: file.fileId,
          currentVersionId: file.currentVersionId,
          ownerId: file.ownerId,
          tenantId: file.tenantId,
          visibility: file.visibility,
          mimeType: file.mimeType,
          size: file.size,
          name: file.name,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        });
        return;
      }

      if (method === "DELETE") {
        files.delete(file.fileId);
        sendEnvelope(res, 200, { deleted: true });
        return;
      }
    }

    sendEnvelope(res, 404, { code: "FILEFN_NOT_FOUND", message: "Route not found" });
  } catch (error) {
    sendEnvelope(res, 500, {
      code: "FILEFN_INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

function sendEnvelope(
  res: ServerResponse,
  status: number,
  dataOrError: Record<string, unknown>,
) {
  const isError = status >= 400;
  const body = isError
    ? { ok: false, error: dataOrError }
    : { ok: true, data: dataOrError };

  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function sendEmpty(res: ServerResponse, status: number) {
  res.statusCode = status;
  res.end();
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function readJSONBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(req);
  if (body.length === 0) {
    return {};
  }
  return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
}

function requestOrigin(req: IncomingMessage) {
  return `http://${req.headers.host ?? `127.0.0.1:${port}`}`;
}

function randomID() {
  return randomUUID().replace(/-/g, "").toLowerCase();
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asRecord(value: unknown): Record<string, JSONValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, JSONValue>;
}
