import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileFnClient, FILEFN_HEIC_CONVERSION_FAILED } from '../index.js';

describe('PHASE_04 client preprocessing', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('TV-CLIENT-003: built-in HEIC preprocessor converts browser uploads deterministically', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          uploadSessionId: 'upl_heic',
          uploadMode: 'multipart-signed-url',
          chunkSizeBytes: 1024,
          totalParts: 1,
          expiresAt: '2025-01-01T00:00:00Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          url: 'https://storage.test/heic-part-1',
          headers: {},
          expiresAt: '2025-01-01T00:00:00Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ ETag: '"etag-heic"' }),
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ recorded: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ fileId: 'file_heic_001', versionId: 'ver_heic_001' }),
      });

    const client = createFileFnClient({
      baseUrl: 'https://api.test/files',
      preprocessing: {
        heic: {
          converter: async () => new Blob(['jpeg-data'], { type: 'image/jpeg' }),
        },
      },
    });

    const file = new File(['heic-data'], 'photo.heic', { type: 'image/heic' });
    const result = await client.uploadFile({
      policy: 'photos',
      file,
      fileId: 'file_heic_001',
    }).done();

    expect(result).toEqual({ fileId: 'file_heic_001', versionId: 'ver_heic_001' });

    const initBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(initBody.fileName).toBe('photo.jpg');
    expect(initBody.mimeType).toBe('image/jpeg');
    expect(initBody.fileId).toBe('file_heic_001');
  });

  it('TV-CLIENT-003 negative: failed HEIC conversion surfaces a stable FileFn error code', async () => {
    const client = createFileFnClient({
      baseUrl: 'https://api.test/files',
      preprocessing: {
        heic: {
          converter: async () => {
            throw new Error('decoder exploded');
          },
        },
      },
    });

    const file = new File(['heic-data'], 'photo.heic', { type: 'image/heic' });

    await expect(
      client.uploadFile({
        policy: 'photos',
        file,
        fileId: 'file_heic_fail',
      }).done(),
    ).rejects.toMatchObject({
      code: FILEFN_HEIC_CONVERSION_FAILED,
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
