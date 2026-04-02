import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFileFn } from '../index.js';
import { createProcessingService, type Processor } from '../processing/service.js';
import { createFakeStorageAdapter } from '@superfunctions/storage';
import { createEventEmitter } from '../events.js';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';

function createFakeDbAdapter() {
  return {
    create: vi.fn().mockResolvedValue({ artifactId: 'art_1' }),
    findOne: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  } as any;
}

const CAPS: AdapterCapabilities = {
  types: { json: true, dates: true, booleans: true, bigint: false, uuid: false, enum: false },
  operations: { batch: false, upsert: true, streaming: false, fulltext: false, returning: false },
  transactions: { supported: false, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: { customIdGeneration: false, numericIds: false, schemaNamespaces: false, customTypes: false },
};

function createStructuredDb(): Adapter {
  const tables = new Map<string, Map<string, any>>();
  let seq = 1;

  function idFor(record: any): string {
    return record.uploadSessionId || record.fileId || record.versionId || record.artifactId || `id_${seq++}`;
  }

  function getTable(model: string): Map<string, any> {
    if (!tables.has(model)) {
      tables.set(model, new Map());
    }
    return tables.get(model)!;
  }

  function matches(record: any, where: any[] = []): boolean {
    for (const clause of where) {
      const value = record?.[clause.field];
      if (clause.operator === 'eq' && value !== clause.value) return false;
      if (clause.operator === 'ne' && value === clause.value) return false;
      if (clause.operator === 'in' && !clause.value.includes(value)) return false;
    }
    return true;
  }

  return {
    id: 'processing-phase3-db',
    name: 'processing-phase3-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const row = { ...params.data };
      getTable(params.model).set(idFor(row), row);
      return row;
    },
    async findOne(params) {
      for (const row of getTable(params.model).values()) {
        if (matches(row, params.where)) return row;
      }
      return null;
    },
    async findMany(params) {
      const rows = Array.from(getTable(params.model).values()).filter((row) => matches(row, params.where));
      if (params.orderBy?.some((item: any) => item.field === 'createdAt' && item.direction === 'desc')) {
        rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      return rows;
    },
    async update(params) {
      const table = getTable(params.model);
      for (const [id, row] of table.entries()) {
        if (matches(row, params.where)) {
          const updated = { ...row, ...params.data };
          table.set(id, updated);
          return updated;
        }
      }
      return null;
    },
    async delete() {},
    async createMany() { return []; },
    async updateMany() { return 0; },
    async deleteMany(params) {
      const table = getTable(params.model);
      let removed = 0;
      for (const [id, row] of table.entries()) {
        if (matches(row, params.where)) {
          table.delete(id);
          removed += 1;
        }
      }
      return removed;
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
}

async function createFileViaUpload(fileFn: ReturnType<typeof createFileFn>, db: Adapter, storageSizes: Map<string, number>) {
  const session = await fileFn.createUploadSession(
    {
      policy: 'user-avatar',
      fileName: 'avatar.png',
      size: 2048,
      mimeType: 'image/png',
    },
    { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_upload' },
  );

  const storedSession = await db.findOne<any>({
    model: 'uploadSessions',
    where: [{ field: 'uploadSessionId', operator: 'eq', value: session.uploadSessionId }],
    namespace: 'filefn',
  });
  storageSizes.set(storedSession.storageKey, 2048);

  await fileFn.completeUploadPart(
    { uploadSessionId: session.uploadSessionId, partNumber: 1, etag: 'etag-1', size: 2048 },
    { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_upload' },
  );

  return fileFn.completeUploadSession(
    { uploadSessionId: session.uploadSessionId },
    { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_upload' },
  );
}

describe('ProcessingService', () => {
  let db: ReturnType<typeof createFakeDbAdapter>;
  let service: ReturnType<typeof createProcessingService>;
  let events: any;

  beforeEach(() => {
    db = createFakeDbAdapter();
    events = createEventEmitter();
    service = createProcessingService({
      db,
      storage: createFakeStorageAdapter({
        capabilities: { signedUploadUrls: true, signedDownloadUrls: true, multipart: true, proxyStreamingUpload: true, proxyStreamingDownload: true },
        async openDownloadStream() {
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3]));
                    controller.close();
                }
            }) as any;
        },
        async openUploadStream() {
            return new WritableStream() as any;
        }
      }),
      events,
      processors: [{
        name: 'test-processor',
        supportedMimeTypes: ['image/png'],
        process: async () => ({
          success: true,
          artifacts: [{
            kind: 'thumbnail-small',
            data: new Uint8Array([1]),
            mimeType: 'image/png',
            storageKey: 'thumb/key'
          }]
        })
      }]
    });
  });

  it('should create artifact if not exists', async () => {
    const input = {
      fileId: 'f1',
      versionId: 'v1',
      storageKey: 'k1',
      mimeType: 'image/png',
      size: 100,
      fileName: 'test.png',
    };
    const ctx = { requestId: 'req1' };

    db.findOne.mockResolvedValue(null); // Not found

    await service.runProcessing(input, ctx);

    expect(db.create).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('should update artifact if exists (idempotency)', async () => {
    const input = {
      fileId: 'f1',
      versionId: 'v1',
      storageKey: 'k1',
      mimeType: 'image/png',
      size: 100,
      fileName: 'test.png',
    };
    const ctx = { requestId: 'req1' };

    db.findOne.mockResolvedValue({ artifactId: 'art_existing', kind: 'thumbnail-small' }); // Found

    await service.runProcessing(input, ctx);

    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it('should propagate request IDs in processing completion events', async () => {
    const completed = vi.fn();
    events.on('processing.completed', completed);

    await service.runProcessing(
      {
        fileId: 'f1',
        versionId: 'v1',
        storageKey: 'k1',
        mimeType: 'image/png',
        size: 100,
        fileName: 'test.png',
      },
      { requestId: 'req_phase3' },
    );

    expect(completed).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req_phase3',
      fileId: 'f1',
      versionId: 'v1',
      artifactsCreated: 1,
    }));
  });

  it('should build queue idempotency keys from file, version, and processor set', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ jobId: 'job_1' }),
    };

    service = createProcessingService({
      db,
      storage: createFakeStorageAdapter({
        capabilities: { signedUploadUrls: true, signedDownloadUrls: true, multipart: true, proxyStreamingUpload: true, proxyStreamingDownload: true },
      }),
      events,
      processors: [
        {
          name: 'zeta',
          supportedMimeTypes: ['image/png'],
          process: async () => ({ success: true, artifacts: [] }),
        },
        {
          name: 'alpha',
          supportedMimeTypes: ['image/png'],
          process: async () => ({ success: true, artifacts: [] }),
        },
      ],
      flowFn: {
        getQueue(name: string) {
          return name === 'filefn.processing' ? (queue as any) : undefined;
        },
      },
    });

    const result = await service.triggerProcessing(
      {
        fileId: 'file_proc_1',
        versionId: 'ver_proc_1',
        storageKey: 'uploads/file_proc_1/ver_proc_1-image.png',
        mimeType: 'image/png',
        size: 10,
        fileName: 'image.png',
      },
      { requestId: 'req_queue' },
    );

    expect(result).toEqual({ enqueued: true, jobId: 'job_1' });
    expect(queue.add).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'processing:file_proc_1:ver_proc_1:alpha,zeta',
    }));
  });

  it('should trigger processing automatically when createFileFn completes an upload session', async () => {
    const structuredDb = createStructuredDb();
    const storageSizes = new Map<string, number>();
    const processingCompleted = vi.fn();

    const fileFn = createFileFn({
      db: structuredDb,
      storage: createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
        async statObject(input) {
          return { key: input.key, size: storageSizes.get(input.key) ?? 2048 };
        },
      }),
      policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 4096 }],
      auth: { required: false },
      processing: {
        enabled: true,
        processors: [
          {
            name: 'thumbnail',
            supportedMimeTypes: ['image/png'],
            async process(input: any) {
              return {
                success: true,
                artifacts: [
                  {
                    kind: 'thumbnail-small',
                    data: new Uint8Array([1, 2, 3]),
                    mimeType: 'image/png',
                    storageKey: `${input.storageKey}.thumb.png`,
                  },
                ],
              };
            },
          },
        ],
      },
    });

    fileFn.events.on('processing.completed', processingCompleted);

    const uploadResult = await createFileViaUpload(fileFn, structuredDb, storageSizes);
    expect(uploadResult.fileId).toMatch(/^file_/);
    expect(uploadResult.versionId).toMatch(/^ver_/);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const artifacts = await structuredDb.findMany<any>({
      model: 'fileArtifacts',
      where: [{ field: 'fileId', operator: 'eq', value: uploadResult.fileId }],
      namespace: 'filefn',
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].kind).toBe('thumbnail-small');
    expect(processingCompleted).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req_upload',
      fileId: uploadResult.fileId,
      versionId: uploadResult.versionId,
      artifactsCreated: 1,
    }));
  });
});
