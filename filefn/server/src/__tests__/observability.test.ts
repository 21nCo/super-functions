import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, redactSecrets, type LogContext, createFileFn, type FileFn, type Logger } from '../index.js';
import { createFakeStorageAdapter } from '@superfunctions/storage';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';
import { createUploadStartedEvent, type FileUploadedEvent, type FileDeletedEvent } from '../events.js';

const FAKE_CAPABILITIES: AdapterCapabilities = {
  types: { json: true, dates: true, booleans: true, bigint: false, uuid: false, enum: false },
  operations: { batch: false, upsert: true, streaming: false, fulltext: false, returning: false },
  transactions: { supported: false, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: { customIdGeneration: false, numericIds: false, schemaNamespaces: false, customTypes: false },
};

function createFakeDbAdapter(): Adapter {
  const tables = new Map<string, Map<string, any>>();
  let idCounter = 1;

  function getTable(model: string): Map<string, any> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function matchesWhere(record: any, where: any[]): boolean {
    for (const clause of where) {
      const value = record[clause.field];
      switch (clause.operator) {
        case 'eq': if (value !== clause.value) return false; break;
        case 'ne': if (value === clause.value) return false; break;
        default: break;
      }
    }
    return true;
  }

  return {
    id: 'fake',
    name: 'fake',
    version: '1.0.0',
    capabilities: FAKE_CAPABILITIES,
    async create(params) {
      const table = getTable(params.model);
      const id = params.data.uploadSessionId || params.data.fileId || params.data.versionId || params.data.permissionId || `id_${idCounter++}`;
      const record = { ...params.data, _id: id };
      table.set(id, record);
      return record;
    },
    async findOne(params) {
      const table = getTable(params.model);
      for (const record of table.values()) {
        if (matchesWhere(record, params.where)) return record;
      }
      return null;
    },
    async findMany(params) {
      const table = getTable(params.model);
      const results: any[] = [];
      for (const record of table.values()) {
        if (!params.where || params.where.length === 0 || matchesWhere(record, params.where)) {
          results.push(record);
        }
      }
      return results;
    },
    async update(params) {
      const table = getTable(params.model);
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, params.where)) {
          const updated = { ...record, ...params.data };
          table.set(id, updated);
          return updated;
        }
      }
      return null;
    },
    async delete(params) {
      const table = getTable(params.model);
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, params.where)) {
          table.delete(id);
          return;
        }
      }
    },
    async createMany() { return []; },
    async updateMany() { return 0; },
    async deleteMany(params) { 
        const table = getTable(params.model);
        let count = 0;
        for (const [id, record] of table.entries()) {
            if (matchesWhere(record, params.where)) {
                table.delete(id);
                count++;
            }
        }
        return count;
    },
    async upsert(params) {
      const existing = await this.findOne({ model: params.model, where: params.where, namespace: params.namespace });
      if (existing) {
        return await this.update({ model: params.model, where: params.where, data: params.update, namespace: params.namespace });
      }
      return await this.create({ model: params.model, data: params.create, namespace: params.namespace });
    },
    async count() { return 0; },
    async transaction(callback) { return callback(this as any); },
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

describe('@filefn/server observability', () => {
  describe('TV-OBS-LOG-NEG-001: Signed URLs are redacted in logs', () => {
    it('should redact AWS signed URLs with X-Amz-Signature', () => {
      const context: LogContext = {
        url: 'https://my-bucket.s3.amazonaws.com/files/file_123/ver_456?X-Amz-Signature=abc123def456',
        requestId: 'req_001',
      };

      const redacted = redactSecrets(context);

      expect(redacted.url).toBe('[REDACTED]');
      expect(redacted.requestId).toBe('req_001');
    });

    it('should redact URLs containing Signature parameter', () => {
      const context: LogContext = {
        downloadUrl: 'https://storage.example.com/path?Signature=secret123&expires=12345',
      };

      const redacted = redactSecrets(context);

      expect(redacted.downloadUrl).toBe('[REDACTED]');
    });

    it('should redact URLs containing token parameter', () => {
      const context: LogContext = {
        signedUrl: 'https://cdn.example.com/files/test.pdf?token=eyJhbGciOiJIUzI1NiJ9',
      };

      const redacted = redactSecrets(context);

      expect(redacted.signedUrl).toBe('[REDACTED]');
    });

    it('should preserve non-secret callback urls', () => {
      const context: LogContext = {
        callbackUrl: 'https://app.example.com/files/file_123',
      };

      const redacted = redactSecrets(context);

      expect(redacted.callbackUrl).toBe('https://app.example.com/files/file_123');
    });
  });

  describe('Logger redacts share tokens', () => {
    it('should redact keys containing "token"', () => {
      const context: LogContext = {
        shareToken: 'shr_abc123def456xyz',
        accessToken: 'jwt_token_here',
      };

      const redacted = redactSecrets(context);

      expect(redacted.shareToken).toBe('[REDACTED]');
      expect(redacted.accessToken).toBe('[REDACTED]');
    });

    it('should redact keys containing "secret"', () => {
      const context: LogContext = {
        apiSecret: 'my-secret-key',
        secretKey: 'another-secret',
      };

      const redacted = redactSecrets(context);

      expect(redacted.apiSecret).toBe('[REDACTED]');
      expect(redacted.secretKey).toBe('[REDACTED]');
    });

    it('should redact keys containing "password"', () => {
      const context: LogContext = {
        password: 'hunter2',
        userPassword: 'secret123',
      };

      const redacted = redactSecrets(context);

      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.userPassword).toBe('[REDACTED]');
    });

    it('should redact Bearer tokens in string values', () => {
      const context: LogContext = {
        authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      };

      const redacted = redactSecrets(context);

      expect(redacted.authHeader).toBe('[REDACTED]');
    });
  });

  describe('Logger redacts long identifiers for safety', () => {
    it('should redact long requestId strings that could be secrets', () => {
      const context: LogContext = {
        requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      };

      const redacted = redactSecrets(context);

      expect(redacted.requestId).toBe('[REDACTED]');
    });

    it('should redact long fileId strings that could be secrets', () => {
      const context: LogContext = {
        fileId: 'f1234567-89ab-cdef-0123-456789abcdef',
      };

      const redacted = redactSecrets(context);

      expect(redacted.fileId).toBe('[REDACTED]');
    });

    it('should preserve non-UUID values for known ID fields', () => {
      const context: LogContext = {
        fileId: 'file_123',
        uploadSessionId: 'upl_456',
        versionId: 'ver_789',
      };

      const redacted = redactSecrets(context);

      expect(redacted.fileId).toBe('file_123');
      expect(redacted.uploadSessionId).toBe('upl_456');
      expect(redacted.versionId).toBe('ver_789');
    });
  });

  describe('Logger handles nested objects', () => {
    it('should redact secrets in nested objects', () => {
      const context: LogContext = {
        request: {
          url: 'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=secret',
          headers: {
            authorization: 'Bearer jwt.token.here',
          },
        },
      };

      const redacted = redactSecrets(context);

      expect((redacted.request as any).url).toBe('[REDACTED]');
      expect((redacted.request as any).headers.authorization).toBe('[REDACTED]');
    });
  });

  describe('Logger handles null and undefined', () => {
    it('should skip null values', () => {
      const context: LogContext = {
        fileId: null as any,
        requestId: undefined,
        value: 'test',
      };

      const redacted = redactSecrets(context);

      expect(redacted.fileId).toBeUndefined();
      expect(redacted.requestId).toBeUndefined();
      expect(redacted.value).toBe('test');
    });
  });

  describe('Logger preserves non-string values', () => {
    it('should preserve numbers', () => {
      const context: LogContext = {
        size: 1024,
        downloads: 5,
      };

      const redacted = redactSecrets(context);

      expect(redacted.size).toBe(1024);
      expect(redacted.downloads).toBe(5);
    });

    it('should preserve booleans', () => {
      const context: LogContext = {
        authenticated: true,
        expired: false,
      };

      const redacted = redactSecrets(context);

      expect(redacted.authenticated).toBe(true);
      expect(redacted.expired).toBe(false);
    });

    it('should preserve arrays', () => {
      const context: LogContext = {
        roles: ['admin', 'user'],
      };

      const redacted = redactSecrets(context);

      expect(redacted.roles).toEqual(['admin', 'user']);
    });
  });

  describe('createLogger', () => {
    it('should log with redacted secrets', () => {
      const outputs: Array<{ level: string; message: string; context: LogContext }> = [];

      const logger = createLogger({
        level: 'info',
        output: (level, message, context) => {
          outputs.push({ level, message, context });
        },
      });

      logger.info('File downloaded', {
        fileName: 'test.png',
        url: 'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=secret',
      });

      expect(outputs.length).toBe(1);
      expect(outputs[0].level).toBe('info');
      expect(outputs[0].message).toBe('File downloaded');
      expect(outputs[0].context.url).toBe('[REDACTED]');
      expect(outputs[0].context.fileName).toBe('test.png');
    });

    it('should respect log level', () => {
      const outputs: string[] = [];

      const logger = createLogger({
        level: 'warn',
        output: (level, message) => {
          outputs.push(`${level}: ${message}`);
        },
      });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(outputs).not.toContain('debug: debug message');
      expect(outputs).not.toContain('info: info message');
      expect(outputs).toContain('warn: warn message');
      expect(outputs).toContain('error: error message');
    });

    it('should include timestamp in logs', () => {
      let capturedContext: LogContext = {};

      const logger = createLogger({
        level: 'info',
        output: (level, message, context) => {
          capturedContext = context;
        },
      });

      logger.info('Test message');

      expect(capturedContext.timestamp).toBeDefined();
      expect(typeof capturedContext.timestamp).toBe('string');
    });

    it('should use console output by default', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createLogger({ level: 'info' });
      logger.info('Test message', { requestId: 'req_001' });

      expect(consoleSpy).toHaveBeenCalled();
      const loggedJson = consoleSpy.mock.calls[0][0];
      expect(loggedJson).toContain('Test message');

      consoleSpy.mockRestore();
    });

    it('should use console.error for error level', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const logger = createLogger({ level: 'error' });
      logger.error('Error occurred');

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should use console.warn for warn level', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const logger = createLogger({ level: 'warn' });
      logger.warn('Warning message');

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Redaction patterns', () => {
    it('should redact long random strings (potential secrets)', () => {
      const context: LogContext = {
        unknownField: 'this-is-a-very-long-random-string-that-looks-like-a-secret-key-abc123',
      };

      const redacted = redactSecrets(context);

      expect(redacted.unknownField).toBe('[REDACTED]');
    });

    it('should preserve short strings', () => {
      const context: LogContext = {
        fileName: 'test.png',
        mimeType: 'image/png',
        policy: 'user-avatar',
      };

      const redacted = redactSecrets(context);

      expect(redacted.fileName).toBe('test.png');
      expect(redacted.mimeType).toBe('image/png');
      expect(redacted.policy).toBe('user-avatar');
    });
  });

  describe('Logger methods', () => {
    it('should have all required log methods', () => {
      const logger = createLogger();

      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should handle empty context', () => {
      const outputs: LogContext[] = [];

      const logger = createLogger({
        level: 'debug',
        output: (level, message, context) => {
          outputs.push(context);
        },
      });

      logger.debug('No context');

      expect(outputs.length).toBe(1);
      expect(outputs[0].timestamp).toBeDefined();
    });
  });

  describe('Event payload redaction', () => {
    it('should redact secret-bearing event fields while preserving safe IDs', () => {
      const event = createUploadStartedEvent({
        uploadSessionId: 'upl_0001',
        fileName: 'avatar.png',
        size: 3,
        mimeType: 'image/png',
        policy: 'user-avatar',
        principalId: 'user_123',
        tenantId: 'org_123',
        signedUrl: 'https://storage.example.com/upload?token=secret',
        uploadSessionToken: 'upls_live_super_secret_token',
      } as any, 'req_001');

      expect(event.requestId).toBe('req_001');
      expect(event.uploadSessionId).toBe('upl_0001');
      expect((event as any).signedUrl).toBe('[REDACTED]');
      expect((event as any).uploadSessionToken).toBe('[REDACTED]');
    });

    it('should preserve safe callback urls while still redacting signed urls', () => {
      const event = createUploadStartedEvent({
        uploadSessionId: 'upl_0002',
        fileName: 'avatar.png',
        size: 3,
        mimeType: 'image/png',
        policy: 'user-avatar',
        callbackUrl: 'https://app.example.com/files/file_123',
        signedUrl: 'https://storage.example.com/download?X-Amz-Signature=secret',
      } as any, 'req_002');

      expect((event as any).callbackUrl).toBe('https://app.example.com/files/file_123');
      expect((event as any).signedUrl).toBe('[REDACTED]');
    });
  });

  describe('Integration: Events and Logging', () => {
    let fileFn: FileFn;
    let logger: Logger;
    let logOutput: Array<{ level: string; message: string; context: LogContext }>;
    let events: Array<any>;

    beforeEach(() => {
        logOutput = [];
        events = [];
        logger = createLogger({
            level: 'info',
            output: (level, message, context) => {
                logOutput.push({ level, message, context });
            }
        });

        fileFn = createFileFn({
            db: createFakeDbAdapter(),
            storage: createFakeStorageAdapter({
                capabilities: { signedUploadUrls: true, signedDownloadUrls: true, multipart: true, proxyStreamingUpload: false, proxyStreamingDownload: true },
                // Mock statObject for size validation
                async statObject(input) { return { key: input.key, size: 100 }; }
            }),
            policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 10485760 }],
            auth: { required: false },
            logger
        });

        // Listen for events
        fileFn.events.on('file:uploaded', (e) => events.push(e));
        fileFn.events.on('file:deleted', (e) => events.push(e));
    });

    it('TV-OBS-001: should emit file:uploaded with requestId', async () => {
        const { uploadSessionId } = await fileFn.createUploadSession(
            { policy: 'user-avatar', fileName: 'test.png', size: 100, mimeType: 'image/png' },
            { principalId: 'user_123', requestId: 'req_001' }
        );

        await fileFn.completeUploadPart(
            { uploadSessionId, partNumber: 1, etag: 'etag1', size: 100 },
            { principalId: 'user_123', requestId: 'req_001' }
        );

        await fileFn.completeUploadSession(
            { uploadSessionId },
            { principalId: 'user_123', requestId: 'req_001' }
        );

        const uploadedEvent = events.find(e => e.type === 'file:uploaded');
        expect(uploadedEvent).toBeDefined();
        expect(uploadedEvent.requestId).toBe('req_001');
        expect(uploadedEvent.fileId).toBeDefined();
    });

    it('should emit file:deleted with requestId', async () => {
        // Create file first
        const { uploadSessionId } = await fileFn.createUploadSession(
            { policy: 'user-avatar', fileName: 'test.png', size: 100, mimeType: 'image/png' },
            { principalId: 'user_123', requestId: 'req_init' }
        );
        await fileFn.completeUploadPart({ uploadSessionId, partNumber: 1, etag: 'etag1', size: 100 }, { principalId: 'user_123' });
        const { fileId } = await fileFn.completeUploadSession({ uploadSessionId }, { principalId: 'user_123' });

        // Clear events
        events.length = 0;

        // Delete
        await fileFn.deleteFile({ fileId }, { principalId: 'user_123', requestId: 'req_del' });

        const deletedEvent = events.find(e => e.type === 'file:deleted');
        expect(deletedEvent).toBeDefined();
        expect(deletedEvent.requestId).toBe('req_del');
        expect(deletedEvent.fileId).toBe(fileId);
    });

    it('TV-OBS-LOG-001: should log structured entries for lifecycle', async () => {
        const { uploadSessionId } = await fileFn.createUploadSession(
            { policy: 'user-avatar', fileName: 'test.png', size: 100, mimeType: 'image/png' },
            { principalId: 'user_123', requestId: 'req_lifecycle' }
        );

        const initLog = logOutput.find(l => l.message === 'Upload session created');
        expect(initLog).toBeDefined();
        expect(initLog!.context.uploadSessionId).toBe(uploadSessionId);
        expect(initLog!.context.requestId).toBe('req_lifecycle');

        await fileFn.completeUploadPart(
            { uploadSessionId, partNumber: 1, etag: 'etag1', size: 100 },
            { principalId: 'user_123', requestId: 'req_lifecycle' }
        );

        const { fileId } = await fileFn.completeUploadSession(
            { uploadSessionId },
            { principalId: 'user_123', requestId: 'req_lifecycle' }
        );

        const completeLog = logOutput.find(l => l.message === 'Upload session completed');
        expect(completeLog).toBeDefined();
        expect(completeLog!.context.fileId).toBe(fileId);
        expect(completeLog!.context.requestId).toBe('req_lifecycle');

        await fileFn.deleteFile({ fileId }, { principalId: 'user_123', requestId: 'req_lifecycle' });

        const deleteLog = logOutput.find(l => l.message === 'File deleted');
        expect(deleteLog).toBeDefined();
        expect(deleteLog!.context.fileId).toBe(fileId);
        expect(deleteLog!.context.requestId).toBe('req_lifecycle');
    });
  });
});
