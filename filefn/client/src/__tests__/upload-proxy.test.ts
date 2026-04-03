import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadManager } from '../upload-manager.js';
import { createHttpClient } from '../client.js';

describe('PHASE_02 client proxy upload', () => {
  const mockFetch = vi.fn();

  const httpClient = createHttpClient({ baseUrl: 'http://localhost' });
  const manager = new UploadManager(httpClient);

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('TV-CLIENT-001: anonymous proxy upload forwards uploadSessionToken on follow-up requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          uploadSessionId: 'sess_1',
          uploadSessionToken: 'upls_live_0001',
          uploadMode: 'proxy',
          chunkSizeBytes: 100,
          totalParts: 1,
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          url: '/upload/sess_1/parts/1',
          headers: { 'content-type': 'text/plain' },
          expiresAt: '2026-03-21T00:00:00Z',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        ok: true,
        data: { etag: 'proxy-sha256-test', recorded: true },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: { fileId: 'f1', versionId: 'v1' },
      }),
    });

    const file = new Blob(['hello'], { type: 'text/plain' });
    const handle = manager.createHandle(
      {
        policy: 'p1',
        file: file as any,
        fileName: 'test.txt',
        fileId: 'f1',
      },
      () =>
        manager.startUpload({
          policy: 'p1',
          file: file as any,
          fileName: 'test.txt',
          fileId: 'f1',
        }),
    );

    const result = await handle.done();

    expect(result).toEqual({ fileId: 'f1', versionId: 'v1' });
    expect(handle.uploadSessionId).toBe('sess_1');
    expect(handle.uploadSessionToken).toBe('upls_live_0001');
    expect(mockFetch).toHaveBeenCalledTimes(4);

    const signCall = mockFetch.mock.calls[1];
    expect(signCall[0]).toBe('http://localhost/upload/sess_1/parts/1/sign');
    const signHeaders = new Headers(signCall[1].headers as HeadersInit);
    expect(signHeaders.get('x-upload-session-token')).toBe('upls_live_0001');

    const putCall = mockFetch.mock.calls[2];
    expect(putCall[0]).toBe('http://localhost/upload/sess_1/parts/1');
    expect(putCall[1].method).toBe('PUT');
    const putHeaders = new Headers(putCall[1].headers as HeadersInit);
    expect(putHeaders.get('x-upload-session-token')).toBe('upls_live_0001');

    const completeCall = mockFetch.mock.calls[3];
    expect(completeCall[0]).toBe('http://localhost/upload/sess_1/complete');
    const completeHeaders = new Headers(completeCall[1].headers as HeadersInit);
    expect(completeHeaders.get('x-upload-session-token')).toBe('upls_live_0001');
  });
});
