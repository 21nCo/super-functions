import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUploadSessionRoutes } from '../upload-sessions/routes.js';
import { createUploadSessionService } from '../upload-sessions/service.js';

describe('Completion Size Validation', () => {
  const mockDb = {
    findOne: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  };

  const mockStorage = {
    capabilities: { multipart: true },
    completeMultipartUpload: vi.fn(),
    statObject: vi.fn(), // We will use this
  };

  const service = createUploadSessionService({
    db: mockDb as any,
    storage: mockStorage as any,
    policies: { get: () => ({}) } as any,
    events: { emit: vi.fn() } as any,
  });

  const routes = createUploadSessionRoutes({ service, auth: { required: false } });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TV-UPLOAD-COMPLETE-VALIDATE-SIZE-NEG-001
  it('fails completion if storage size does not match session size', async () => {
    mockDb.findOne.mockResolvedValue({
      uploadSessionId: 'sess_1',
      status: 'in_progress',
      uploadMode: 'multipart-signed-url',
      totalParts: 1,
      size: 100, // Expected
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      storageKey: 'key',
      storageUploadId: 'uid'
    });
    
    mockDb.findMany.mockResolvedValue([{ partNumber: 1, etag: 'e1' }]);

    // Storage reports different size
    mockStorage.statObject.mockResolvedValue({ size: 99 });

    const req = new Request('http://localhost/upload/sess_1/complete', { method: 'POST' });
    
    const res = await routes.completeSession(req, 'sess_1');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('FILEFN_UPLOAD_SIZE_MISMATCH');
    expect(body.error.details).toEqual({ expected: 100, actual: 99 });
    expect(mockStorage.completeMultipartUpload).toHaveBeenCalled();
    expect(mockStorage.statObject).toHaveBeenCalledWith({ key: 'key', target: 'durable' });
  });
});
