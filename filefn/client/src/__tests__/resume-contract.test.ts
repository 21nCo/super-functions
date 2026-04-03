import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileFnClient } from '../index.js';

const mockFetch = vi.fn();

function createResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(headers),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PHASE_00 CLIENT-001 resume contract conformance', () => {
  it('TV-CLIENT-001: anonymous upload should carry uploadSessionToken on follow-up requests', async () => {
    const client = createFileFnClient({ baseUrl: 'https://api.test/files' });

    mockFetch
      .mockResolvedValueOnce(
        createResponse({
          ok: true,
          data: {
            uploadSessionId: 'upl_0001',
            uploadSessionToken: 'upls_live_0001',
            uploadMode: 'proxy',
            chunkSizeBytes: 3,
            totalParts: 1,
            expiresAt: '2026-03-21T12:56:10Z',
          },
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          ok: true,
          data: {
            url: '/upload/upl_0001/parts/1',
            headers: { 'content-type': 'application/octet-stream' },
            expiresAt: '2026-03-21T12:56:10Z',
          },
        })
      )
      .mockResolvedValueOnce(
        createResponse(
          {
            ok: true,
            data: {
              etag: 'proxy-etag-1',
              size: 3,
              recorded: true,
            },
          },
          200,
          { 'content-type': 'application/json' }
        )
      )
      .mockResolvedValueOnce(
        createResponse({
          ok: true,
          data: {
            fileId: 'file_0001',
            versionId: 'ver_0001',
          },
        })
      );

    const handle = client.uploadFile({
      policy: 'user-avatar',
      file: new Blob(['abc'], { type: 'application/octet-stream' }),
      fileName: 'a.bin',
      fileId: 'file_0001',
    });

    const result = await handle.done();

    expect(result).toEqual({ fileId: 'file_0001', versionId: 'ver_0001' });

    const signCall = mockFetch.mock.calls[1];
    const signRequestInit = signCall[1] as RequestInit;
    const signHeaders = signRequestInit.headers as Record<string, string>;

    expect(signHeaders['x-upload-session-token']).toBe('upls_live_0001');
  });
});
