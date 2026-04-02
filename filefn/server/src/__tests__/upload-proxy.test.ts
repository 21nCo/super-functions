import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUploadSessionRoutes } from '../upload-sessions/routes.js';
import { createUploadSessionService } from '../upload-sessions/service.js';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';

const CAPS: AdapterCapabilities = {
  types: { json: true, dates: true, booleans: true, bigint: false, uuid: false, enum: false },
  operations: { batch: false, upsert: true, streaming: false, fulltext: false, returning: false },
  transactions: { supported: false, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: { customIdGeneration: false, numericIds: false, schemaNamespaces: false, customTypes: false },
};

type Row = Record<string, any>;

type MemoryDb = {
  db: Adapter;
  all(model: string): Row[];
};

function createMemoryDb(): MemoryDb {
  const tables = new Map<string, Map<string, Row>>();
  let idCounter = 1;

  function table(model: string): Map<string, Row> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function match(record: Row, where: any[] = []): boolean {
    for (const clause of where) {
      const value = record?.[clause.field];
      if (clause.operator === 'eq' && value !== clause.value) return false;
      if (clause.operator === 'ne' && value === clause.value) return false;
      if (clause.operator === 'lt' && !(value < clause.value)) return false;
      if (clause.operator === 'gt' && !(value > clause.value)) return false;
    }
    return true;
  }

  const db: Adapter = {
    id: 'mem-db',
    name: 'mem-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const t = table(params.model);
      const id =
        (params.model === 'uploadParts' ? `${params.data.uploadSessionId}:${params.data.partNumber}` : undefined) ||
        (params.model === 'uploadSessions' ? params.data.uploadSessionId : undefined) ||
        (params.model === 'files' ? params.data.fileId : undefined) ||
        (params.model === 'fileVersions' ? params.data.versionId : undefined) ||
        params.data.permissionId ||
        params.data.artifactId ||
        `id_${idCounter++}`;
      const row = { ...params.data, _id: id };
      t.set(id, row);
      return row;
    },
    async findOne(params) {
      for (const row of table(params.model).values()) {
        if (match(row, params.where)) return row;
      }
      return null;
    },
    async findMany(params) {
      const rows = Array.from(table(params.model).values()).filter((row) => match(row, params.where));
      if (params.select && params.select.length > 0) {
        return rows.map((row) => {
          const projected: Row = {};
          for (const key of params.select!) projected[key] = row[key];
          return projected;
        });
      }
      return rows;
    },
    async update(params) {
      const t = table(params.model);
      for (const [id, row] of t.entries()) {
        if (match(row, params.where)) {
          const next = { ...row, ...params.data };
          t.set(id, next);
          return next;
        }
      }
      return null;
    },
    async delete(params) {
      const t = table(params.model);
      for (const [id, row] of t.entries()) {
        if (match(row, params.where)) {
          t.delete(id);
          return;
        }
      }
    },
    async createMany() { return []; },
    async updateMany() { return 0; },
    async deleteMany(params) {
      const t = table(params.model);
      let deleted = 0;
      for (const [id, row] of t.entries()) {
        if (match(row, params.where)) {
          t.delete(id);
          deleted += 1;
        }
      }
      return deleted;
    },
    async upsert(params) {
      const existing = await this.findOne({ model: params.model, where: params.where, namespace: params.namespace });
      if (existing) {
        return this.update({ model: params.model, where: params.where, data: params.update, namespace: params.namespace });
      }
      return this.create({ model: params.model, data: params.create, namespace: params.namespace });
    },
    async count() { return 0; },
    async transaction(cb) { return cb(this as any); },
    async initialize() {},
    async isHealthy() { return { healthy: true, uptime: 0 }; },
    async close() {},
    async getSchemaVersion() { return 0; },
    async setSchemaVersion() {},
    async validateSchema() { return { valid: true }; },
    internal: {
      async ensureTable() {},
      async create() { return {}; },
      async findOne() { return null; },
      async findMany() { return []; },
      async update() { return 0; },
      async delete() { return 0; },
    },
  } as Adapter;

  return {
    db,
    all(model: string) {
      return Array.from(table(model).values());
    },
  };
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function createMemoryStorage(capabilities: {
  signedUploadUrls: boolean;
  multipart: boolean;
  proxyStreamingUpload: boolean;
}) {
  const objects = new Map<string, Uint8Array>();

  return {
    objects,
    adapter: {
      capabilities: {
        ...capabilities,
        signedDownloadUrls: true,
        proxyStreamingDownload: true,
      },
      createMultipartUpload: vi.fn(async () => ({ uploadId: 'up_1' })),
      signMultipartUploadPartUrl: vi.fn(async () => ({ url: 'https://signed.example/upload', headers: { 'x-test': '1' } })),
      completeMultipartUpload: vi.fn(async () => {}),
      openUploadStream: vi.fn(async ({ key }: { key: string }) => {
        const chunks: Uint8Array[] = [];
        return new WritableStream<Uint8Array>({
          write(chunk) {
            chunks.push(new Uint8Array(chunk));
          },
          close() {
            objects.set(key, concatChunks(chunks));
          },
        });
      }),
      openDownloadStream: vi.fn(async ({ key }: { key: string }) => {
        const bytes = objects.get(key);
        if (!bytes) throw new Error(`Object not found: ${key}`);
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        });
      }),
      deleteObject: vi.fn(async ({ key }: { key: string }) => {
        objects.delete(key);
      }),
      statObject: vi.fn(async ({ key }: { key: string }) => {
        const bytes = objects.get(key) || new Uint8Array();
        return { key, size: bytes.byteLength };
      }),
    },
  };
}

function policyRegistry() {
  return {
    get: vi.fn(() => ({
      maxSizeBytes: 10 * 1024 * 1024,
      contentTypes: ['text/plain'],
      visibility: 'private',
    })),
  };
}

function jsonBody(input: unknown): string {
  return JSON.stringify(input);
}

describe('PHASE_02 upload mode and proxy semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TV-UPLOAD-MODE-001: selects only canonical upload modes', async () => {
    const dbA = createMemoryDb();
    const storageA = createMemoryStorage({ signedUploadUrls: true, multipart: true, proxyStreamingUpload: false });
    const serviceA = createUploadSessionService({
      db: dbA.db,
      storage: storageA.adapter as any,
      policies: policyRegistry() as any,
      events: { emit: vi.fn() } as any,
    });

    const a = await serviceA.createSession(
      { policy: 'p1', fileName: 'a.txt', size: 3, mimeType: 'text/plain' },
      { principalId: 'u1', requestId: 'req_a' },
    );
    expect(a.uploadMode).toBe('multipart-signed-url');

    const dbB = createMemoryDb();
    const storageB = createMemoryStorage({ signedUploadUrls: false, multipart: false, proxyStreamingUpload: true });
    const serviceB = createUploadSessionService({
      db: dbB.db,
      storage: storageB.adapter as any,
      policies: policyRegistry() as any,
      events: { emit: vi.fn() } as any,
    });

    const b = await serviceB.createSession(
      { policy: 'p1', fileName: 'b.txt', size: 3, mimeType: 'text/plain' },
      { principalId: 'u1', requestId: 'req_b' },
    );
    expect(b.uploadMode).toBe('proxy');
    expect(b.uploadMode).not.toBe('signed-url');
  });

  it('TV-UPLOAD-MODE-NEG-001: init fails with FILEFN_NO_SUPPORTED_UPLOAD_MODE when no valid mode exists', async () => {
    const db = createMemoryDb();
    const storage = createMemoryStorage({ signedUploadUrls: true, multipart: false, proxyStreamingUpload: false });
    const service = createUploadSessionService({
      db: db.db,
      storage: storage.adapter as any,
      policies: policyRegistry() as any,
      events: { emit: vi.fn() } as any,
    });

    await expect(
      service.createSession(
        { policy: 'p1', fileName: 'c.txt', size: 3, mimeType: 'text/plain' },
        { principalId: 'u1', requestId: 'req_c' },
      ),
    ).rejects.toMatchObject({ code: 'FILEFN_NO_SUPPORTED_UPLOAD_MODE' });
  });

  it('TV-UPLOAD-PROXY-001: proxy PUT records durable part, status shows recordedParts, and complete succeeds', async () => {
    const db = createMemoryDb();
    const storage = createMemoryStorage({ signedUploadUrls: false, multipart: false, proxyStreamingUpload: true });
    const service = createUploadSessionService({
      db: db.db,
      storage: storage.adapter as any,
      policies: policyRegistry() as any,
      events: { emit: vi.fn() } as any,
    });
    const routes = createUploadSessionRoutes({ service, auth: { required: false } });

    const initReq = new Request('http://localhost/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonBody({ policy: 'p1', fileName: 'proxy.txt', size: 3, mimeType: 'text/plain' }),
    });
    const initRes = await routes.initSession(initReq);
    const initBody = await initRes.json();
    expect(initRes.status).toBe(200);
    expect(initBody.data.uploadMode).toBe('proxy');

    const uploadSessionId = initBody.data.uploadSessionId as string;
    const uploadSessionToken = initBody.data.uploadSessionToken as string;

    const signReq = new Request(`http://localhost/upload/${uploadSessionId}/parts/1/sign`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-upload-session-token': uploadSessionToken,
      },
      body: jsonBody({ contentLength: 3 }),
    });
    const signRes = await routes.signPart(signReq, uploadSessionId, 1);
    const signBody = await signRes.json();
    expect(signRes.status).toBe(200);
    expect(signBody.data.url).toBe(`/upload/${uploadSessionId}/parts/1`);

    const putReq = new Request(`http://localhost/upload/${uploadSessionId}/parts/1`, {
      method: 'PUT',
      headers: {
        'content-length': '3',
        'content-type': 'text/plain',
        'x-upload-session-token': uploadSessionToken,
      },
      body: 'abc',
      duplex: 'half' as any,
    } as any);
    const putRes = await routes.uploadPartBytes(putReq, uploadSessionId, 1);
    const putBody = await putRes.json();
    expect(putRes.status).toBe(200);
    expect(putBody.data.recorded).toBe(true);
    expect(putBody.data.size).toBe(3);
    expect(putBody.data.etag).toMatch(/^proxy-sha256-/);

    const statusReq = new Request(`http://localhost/upload/${uploadSessionId}/status`, {
      method: 'GET',
      headers: { 'x-upload-session-token': uploadSessionToken },
    });
    const statusRes = await routes.getStatus(statusReq, uploadSessionId);
    const statusBody = await statusRes.json();
    expect(statusRes.status).toBe(200);
    expect(statusBody.data.recordedParts).toEqual([1]);

    const completeReq = new Request(`http://localhost/upload/${uploadSessionId}/complete`, {
      method: 'POST',
      headers: { 'x-upload-session-token': uploadSessionToken },
    });
    const completeRes = await routes.completeSession(completeReq, uploadSessionId);
    const completeBody = await completeRes.json();
    expect(completeRes.status).toBe(200);
    expect(completeBody.data.fileId).toBeDefined();
    expect(completeBody.data.versionId).toBeDefined();

    const uploadSession = db.all('uploadSessions').find((s) => s.uploadSessionId === uploadSessionId)!;
    expect(storage.objects.get(uploadSession.storageKey)).toEqual(new TextEncoder().encode('abc'));
    expect(storage.objects.has(`${uploadSession.storageKey}.part1`)).toBe(false);
  });

  it('TV-UPLOAD-PROXY-NEG-001: conflicting bytes for a recorded proxy part returns FILEFN_PART_CONFLICT', async () => {
    const db = createMemoryDb();
    const storage = createMemoryStorage({ signedUploadUrls: false, multipart: false, proxyStreamingUpload: true });
    const service = createUploadSessionService({
      db: db.db,
      storage: storage.adapter as any,
      policies: policyRegistry() as any,
      events: { emit: vi.fn() } as any,
    });
    const routes = createUploadSessionRoutes({ service, auth: { required: false } });

    const initReq = new Request('http://localhost/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonBody({ policy: 'p1', fileName: 'proxy.txt', size: 3, mimeType: 'text/plain' }),
    });
    const initRes = await routes.initSession(initReq);
    const initBody = await initRes.json();
    const uploadSessionId = initBody.data.uploadSessionId as string;
    const uploadSessionToken = initBody.data.uploadSessionToken as string;

    const firstPutReq = new Request(`http://localhost/upload/${uploadSessionId}/parts/1`, {
      method: 'PUT',
      headers: {
        'content-length': '3',
        'content-type': 'text/plain',
        'x-upload-session-token': uploadSessionToken,
      },
      body: 'abc',
      duplex: 'half' as any,
    } as any);
    const firstPutRes = await routes.uploadPartBytes(firstPutReq, uploadSessionId, 1);
    expect(firstPutRes.status).toBe(200);

    const conflictingPutReq = new Request(`http://localhost/upload/${uploadSessionId}/parts/1`, {
      method: 'PUT',
      headers: {
        'content-length': '3',
        'content-type': 'text/plain',
        'x-upload-session-token': uploadSessionToken,
      },
      body: 'abd',
      duplex: 'half' as any,
    } as any);
    const conflictingPutRes = await routes.uploadPartBytes(conflictingPutReq, uploadSessionId, 1);
    const conflictBody = await conflictingPutRes.json();

    expect(conflictingPutRes.status).toBe(409);
    expect(conflictBody.error.code).toBe('FILEFN_PART_CONFLICT');
  });

  it('TV-UPLOAD-PROXY-NEG-002: missing proxy PUT body returns a structured 400 error', async () => {
    const db = createMemoryDb();
    const storage = createMemoryStorage({ signedUploadUrls: false, multipart: false, proxyStreamingUpload: true });
    const service = createUploadSessionService({
      db: db.db,
      storage: storage.adapter as any,
      policies: policyRegistry() as any,
      events: { emit: vi.fn() } as any,
    });
    const routes = createUploadSessionRoutes({ service, auth: { required: false } });

    const initReq = new Request('http://localhost/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonBody({ policy: 'p1', fileName: 'proxy.txt', size: 3, mimeType: 'text/plain' }),
    });
    const initRes = await routes.initSession(initReq);
    const initBody = await initRes.json();
    const uploadSessionId = initBody.data.uploadSessionId as string;
    const uploadSessionToken = initBody.data.uploadSessionToken as string;

    const putReq = new Request(`http://localhost/upload/${uploadSessionId}/parts/1`, {
      method: 'PUT',
      headers: {
        'content-length': '3',
        'content-type': 'text/plain',
        'x-upload-session-token': uploadSessionToken,
      },
    });

    const putRes = await routes.uploadPartBytes(putReq, uploadSessionId, 1);
    const putBody = await putRes.json();

    expect(putRes.status).toBe(400);
    expect(putBody.error.code).toBe('FILEFN_INVALID_REQUEST');
  });
});
