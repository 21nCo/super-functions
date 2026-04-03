/**
 * Test vectors for client envelope unwrapping (CLIENT-001)
 * 
 * These tests encode the audit gaps for client/server contract:
 * - TV-CLIENT-ENVELOPE-UNWRAP-001: Client unwraps server success envelopes
 * - TV-CLIENT-UPLOAD-001: Client runs the canonical upload flow
 * - TV-CLIENT-UPLOAD-NEG-001: Client surfaces server policy error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileFnClient } from '../src/index.js';
import type { FileFnClient } from '../src/index.js';

describe('@filefn/client envelope unwrapping', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('TV-CLIENT-ENVELOPE-UNWRAP-001: Unwrap success envelopes', () => {
    it('should unwrap { ok: true, data } and return data to higher-level methods', async () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      // Mock server response for GET /file_0001
      const serverResponse = {
        ok: true,
        data: { fileId: 'file_0001', fileName: 'test.png', mimeType: 'image/png' },
        requestId: 'req_013',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => serverResponse,
      });

      // The client should have a getFile method that returns unwrapped data
      // This will fail until the client implements getFile and envelope unwrapping
      const file = await (client as any).getFile('file_0001');

      expect(file.fileId).toBe('file_0001');
      expect(file.fileName).toBe('test.png');
      // Should NOT have ok, data wrapper
      expect(file.ok).toBeUndefined();
      expect(file.data).toBeUndefined();
      expect((mockFetch.mock.calls[0]?.[1] as RequestInit)?.headers).not.toMatchObject({
        'Content-Type': 'application/json',
      });
    });

    it('should unwrap listArtifacts and downloadArtifact envelopes', async () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              artifacts: [
                {
                  artifactId: 'art_pdf_001',
                  fileId: 'file_0001',
                  versionId: 'ver_0001',
                  kind: 'pdf-preview-page-1-large',
                  mimeType: 'image/png',
                  size: 123,
                  createdAt: '2026-03-22T00:00:00Z',
                },
              ],
            },
            requestId: 'req_artifacts',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              url: '/proxy/files/file_0001/artifacts/art_pdf_001/download',
            },
            requestId: 'req_artifact_download',
          }),
        });

      const artifacts = await client.listArtifacts('file_0001');
      const artifactUrl = await client.downloadArtifact('file_0001', 'art_pdf_001');

      expect(artifacts).toEqual([
        expect.objectContaining({
          artifactId: 'art_pdf_001',
          kind: 'pdf-preview-page-1-large',
        }),
      ]);
      expect(artifactUrl).toBe('/proxy/files/file_0001/artifacts/art_pdf_001/download');
    });

    it('should unwrap render descriptor envelopes for resolveRenderable', async () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            fileId: 'file_pdf_1',
            versionId: 'ver_pdf_1',
            intent: 'preview',
            state: 'ready',
            mimeType: 'image/png',
            name: 'note.pdf',
            size: 456,
            source: {
              mode: 'artifact',
              artifactId: 'art_pdf_1',
              artifactKind: 'pdf-preview-page-1-large',
              url: '/proxy/files/file_pdf_1/artifacts/art_pdf_1/download',
            },
          },
          requestId: 'req_render',
        }),
      });

      const descriptor = await client.resolveRenderable({
        fileId: 'file_pdf_1',
        intent: 'preview',
      });

      expect(descriptor).toMatchObject({
        fileId: 'file_pdf_1',
        versionId: 'ver_pdf_1',
        intent: 'preview',
        state: 'ready',
        source: {
          mode: 'artifact',
          artifactKind: 'pdf-preview-page-1-large',
          url: '/proxy/files/file_pdf_1/artifacts/art_pdf_1/download',
        },
      });
    });

    it('should unwrap upload init response and set uploadSessionId after done()', async () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      // Server sends canonical envelope for init
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            uploadSessionId: 'upl_0001',
            uploadMode: 'multipart-signed-url',
            chunkSizeBytes: 8388608,
            totalParts: 1,
            expiresAt: '2026-01-25T13:46:33Z',
          },
          warnings: [],
          requestId: 'req_001',
        }),
      });

      // Mock sign part response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            url: 'https://storage.test/upload/stor_upl_0001/part/1',
            headers: { 'content-type': 'image/png' },
            expiresAt: '2026-01-24T14:01:33Z',
          },
          requestId: 'req_005',
        }),
      });

      // Mock upload to signed URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_part_1' }),
      });

      // Mock complete part response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { recorded: true },
          requestId: 'req_007',
        }),
      });

      // Mock complete upload response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { fileId: 'file_0001', versionId: 'ver_0001' },
          requestId: 'req_010',
        }),
      });

      // Internal initUpload should return the unwrapped data
      const file = new File([new Uint8Array([1])], 'avatar.png', { type: 'image/png' });
      const handle = client.uploadFile({
        policy: 'user-avatar',
        file,
        fileId: 'file_0001',
      });

      // The uploadSessionId should be set after the upload completes
      await handle.done();

      // The handle should have uploadSessionId set (from unwrapped data)
      expect(handle.uploadSessionId).toBe('upl_0001');
    });
  });

  describe('TV-CLIENT-UPLOAD-001: Canonical upload flow', () => {
    it('should complete upload and return { fileId, versionId }', async () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      // Mock init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            uploadSessionId: 'upl_0001',
            uploadMode: 'multipart-signed-url',
            chunkSizeBytes: 8388608,
            totalParts: 1,
            expiresAt: '2026-01-25T13:46:33Z',
          },
          requestId: 'req_001',
        }),
      });

      // Mock sign part response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            url: 'https://storage.test/upload/stor_upl_0001/part/1',
            headers: { 'content-type': 'image/png' },
            expiresAt: '2026-01-24T14:01:33Z',
          },
          requestId: 'req_005',
        }),
      });

      // Mock upload to signed URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_part_1' }),
      });

      // Mock complete part response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { recorded: true },
          requestId: 'req_007',
        }),
      });

      // Mock complete upload response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { fileId: 'file_0001', versionId: 'ver_0001' },
          requestId: 'req_010',
        }),
      });

      const file = new File([new Uint8Array([1])], 'avatar.png', { type: 'image/png' });
      const handle = client.uploadFile({
        policy: 'user-avatar',
        file,
        fileId: 'file_0001',
      });

      const result = await handle.done();

      expect(result.fileId).toBe('file_0001');
      expect(result.versionId).toBe('ver_0001');
    });
  });

  describe('TV-CLIENT-UPLOAD-NEG-001: Client surfaces server policy error', () => {
    it('should surface structured error with code from server', async () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      // Mock server error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          ok: false,
          error: {
            code: 'FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED',
            message: 'Content type not allowed',
            details: { policy: 'user-avatar', mimeType: 'image/gif' },
          },
          requestId: 'req_002',
        }),
        text: async () => 'Bad Request',
      });

      const file = new File([new Uint8Array([1])], 'avatar.gif', { type: 'image/gif' });
      const handle = client.uploadFile({
        policy: 'user-avatar',
        file,
      });

      // The error should include the structured error from server
      // This will fail until client properly surfaces error envelopes
      await expect(handle.done()).rejects.toMatchObject({
        body: {
          ok: false,
          error: {
            code: 'FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED',
          },
        },
      });
    });
  });

  describe('Client sends correct request fields', () => {
    it('should send size and mimeType (not fileSize and contentType) to upload init', async () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      let capturedBody: any = null;
      let initCalled = false;

      mockFetch.mockImplementation(async (url: string, options: any) => {
        if (url.includes('/upload/init')) {
          initCalled = true;
          capturedBody = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: {
                uploadSessionId: 'upl_0001',
                uploadMode: 'multipart-signed-url',
                chunkSizeBytes: 8388608,
                totalParts: 1,
                expiresAt: '2026-01-25T13:46:33Z',
              },
            }),
          };
        }
        if (url.includes('/parts/') && url.includes('/sign')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: {
                url: 'https://storage.test/upload',
                headers: { 'content-type': 'image/png' },
                expiresAt: '2026-01-25T14:00:00Z',
              },
            }),
          };
        }
        if (url.includes('storage.test')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ ETag: 'etag1' }),
          };
        }
        if (url.includes('/complete')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: { recorded: true, fileId: 'file_0001', versionId: 'ver_0001' },
            }),
          };
        }
        // Return default for other requests
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: {} }),
          headers: new Headers(),
        };
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' });
      const handle = client.uploadFile({
        policy: 'user-avatar',
        file,
        fileId: 'file_0001',
      });

      // Actually complete the upload to ensure init is called
      await handle.done();

      // Verify init was called
      expect(initCalled).toBe(true);

      // The client should send `size` and `mimeType`, NOT `fileSize` and `contentType`
      // This is the core audit gap - client/server field name mismatch
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.size).toBe(3);
      expect(capturedBody.mimeType).toBe('image/png');
      // Should NOT have the old field names
      expect(capturedBody.fileSize).toBeUndefined();
      expect(capturedBody.contentType).toBeUndefined();
    });
  });
});

describe('@filefn/client public API surface', () => {
  describe('Client exposes required methods', () => {
    it('should expose uploadFile, getFile, listArtifacts, downloadUrl, downloadArtifact, resolveRenderable, deleteFile', () => {
      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      }) as any;

      // These are required by the spec
      expect(typeof client.uploadFile).toBe('function');
      expect(typeof client.getFile).toBe('function');
      expect(typeof client.listArtifacts).toBe('function');
      expect(typeof client.downloadUrl).toBe('function');
      expect(typeof client.downloadArtifact).toBe('function');
      expect(typeof client.resolveRenderable).toBe('function');
      expect(typeof client.deleteFile).toBe('function');
    });
  });

  describe('UploadHandle interface', () => {
    it('should have uploadSessionId, abort, onProgress, done', () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            uploadSessionId: 'upl_0001',
            uploadMode: 'multipart-signed-url',
            chunkSizeBytes: 8388608,
            totalParts: 1,
            expiresAt: '2026-01-25T13:46:33Z',
          },
        }),
      }));

      const client = createFileFnClient({
        baseUrl: 'https://api.test/files',
      });

      const file = new File([new Uint8Array([1])], 'test.png', { type: 'image/png' });
      const handle = client.uploadFile({ policy: 'test', file, fileId: 'file_handle_001' });

      expect(handle.uploadSessionId).toBeDefined();
      expect(handle.fileId).toBe('file_handle_001');
      expect(typeof handle.abort).toBe('function');
      expect(typeof handle.onProgress).toBe('function');
      expect(typeof handle.done).toBe('function');
    });
  });
});
