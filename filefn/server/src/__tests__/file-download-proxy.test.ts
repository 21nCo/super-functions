import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFileRoutes } from '../files/routes.js';
import { createFileService } from '../files/service.js';

describe('Proxy Download', () => {
  const mockDb = {
    findOne: vi.fn(),
  };

  const mockStorage = {
    capabilities: {
      signedDownloadUrls: false, // Force proxy
    },
    signDownloadUrl: vi.fn(),
    openDownloadStream: vi.fn(),
  };

  const mockAuthorizer = {
    canRead: vi.fn().mockResolvedValue(true),
  };

  const service = createFileService({
    db: mockDb as any,
    storage: mockStorage as any,
    events: {} as any,
    authorizer: mockAuthorizer as any,
  });

  const routes = createFileRoutes({
    service,
    auth: { required: false },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDownloadUrl returns proxy URL when signed URLs unsupported', async () => {
    mockDb.findOne
      .mockResolvedValueOnce({ fileId: 'f1', currentVersionId: 'v1' }) // getFile
      .mockResolvedValueOnce({ versionId: 'v1', storageKey: 'k1', fileId: 'f1' }); // getVersion

    const req = new Request('http://localhost/f1/download', { method: 'GET' });
    const res = await routes.downloadFile(req, 'f1');
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toMatch(/\/proxy\/files\/f1\/download$/);
  });

  it('getDownloadUrl returns version proxy URL when versionId is provided', async () => {
    mockDb.findOne
      .mockResolvedValueOnce({ fileId: 'f1', currentVersionId: 'v1' }) // getFile
      .mockResolvedValueOnce({ versionId: 'v2', storageKey: 'k2', fileId: 'f1' }); // getVersionChecked(v2)

    const req = new Request('http://localhost/f1/versions/v2/download', { method: 'GET' });
    const res = await routes.downloadFile(req, 'f1', 'v2');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toMatch(/\/proxy\/files\/f1\/versions\/v2\/download$/);
    expect(body.data.url).not.toMatch(/^proxy:\/\//);
  });
});
