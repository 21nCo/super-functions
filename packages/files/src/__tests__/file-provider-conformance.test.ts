import { describe, expect, it } from 'vitest';
import type { FileProvider } from '../types.js';

function createConformantProvider(): FileProvider {
  return {
    async createUploadSession() {
      return {
        uploadSessionId: 'upl_0001',
        uploadMode: 'multipart-signed-url',
        chunkSizeBytes: 8 * 1024 * 1024,
        totalParts: 1,
        expiresAt: '2026-03-21T12:56:10Z',
        uploadSessionToken: 'upls_live_0001',
      } as any;
    },
    async getUploadSessionStatus(input) {
      return {
        uploadSessionId: input.uploadSessionId,
        status: 'in_progress',
        totalParts: 3,
        recordedParts: [1, 2],
        chunkSizeBytes: 8 * 1024 * 1024,
        fileSize: 16_777_217,
        expiresAt: '2026-03-21T12:56:10Z',
      } as any;
    },
    async signUploadPart() {
      return { url: 'https://storage.example/upload-part', headers: {}, expiresAt: '2026-03-21T12:56:10Z' } as any;
    },
    async completeUploadPart() {
      return { recorded: true } as any;
    },
    async completeUploadSession() {
      return { fileId: 'file_0001', versionId: 'ver_0001' };
    },
    async abortUploadSession() {
      return;
    },
    async getFile(input) {
      return {
        fileId: input.fileId,
        versionId: input.versionId ?? 'ver_current',
      } as any;
    },
    async listFiles() {
      return { files: [], nextCursor: undefined } as any;
    },
    async deleteFile() {
      return;
    },
  };
}

describe('PHASE_06 BUILD-001 FileProvider conformance suite', () => {
  it('requires canonical createUploadSession shape (TV-UPLOAD-AUTH-001 + TV-UPLOAD-STATUS-001)', async () => {
    const provider = createConformantProvider();

    const session = await provider.createUploadSession(
      {
        policy: 'user-avatar',
        fileName: 'avatar.png',
        size: 3,
        mimeType: 'image/png',
      },
      { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_001' },
    ) as any;

    expect(session).toMatchObject({
      uploadSessionId: expect.any(String),
      uploadMode: expect.stringMatching(/^(multipart-signed-url|proxy)$/),
      chunkSizeBytes: expect.any(Number),
      totalParts: expect.any(Number),
      expiresAt: expect.any(String),
    });
    expect(typeof session.uploadSessionToken === 'string' || session.uploadSessionToken === undefined).toBe(true);
  });

  it('requires canonical status fields with recordedParts (TV-UPLOAD-STATUS-001)', async () => {
    const provider = createConformantProvider();

    const status = await provider.getUploadSessionStatus(
      { uploadSessionId: 'upl_0001' },
      { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_004' },
    ) as any;

    expect(status).toMatchObject({
      uploadSessionId: 'upl_0001',
      status: expect.any(String),
      totalParts: expect.any(Number),
      recordedParts: expect.any(Array),
      chunkSizeBytes: expect.any(Number),
      fileSize: expect.any(Number),
      expiresAt: expect.any(String),
    });
  });

  it('requires version-aware provider reads (TV-VERSION-001)', async () => {
    const provider = createConformantProvider();

    const versioned = await provider.getFile(
      { fileId: 'file_0001', versionId: 'ver_old' },
      { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_003' },
    ) as any;

    expect(versioned.versionId).toBe('ver_old');
  });

  it('requires canonical part-sign and completion contract fields', async () => {
    const provider = createConformantProvider();

    const signResult = await provider.signUploadPart(
      { uploadSessionId: 'upl_0001', partNumber: 1, contentLength: 3 },
      { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_sign' },
    ) as any;

    expect(signResult.url).toEqual(expect.any(String));
    expect(signResult.headers).toEqual(expect.any(Object));
    expect(signResult.expiresAt).toEqual(expect.any(String));

    const completePartResult = await provider.completeUploadPart(
      { uploadSessionId: 'upl_0001', partNumber: 1, etag: 'etag_001', size: 3 },
      { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_complete_part' },
    ) as any;

    expect(completePartResult?.recorded).toBe(true);
  });

  it('requires canonical listFiles and completeUploadSession shapes', async () => {
    const provider = createConformantProvider();

    const listed = await provider.listFiles(
      { cursor: undefined, limit: 20 },
      { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_list' },
    ) as any;
    expect(listed.files).toEqual(expect.any(Array));
    if (listed.nextCursor !== undefined) {
      expect(listed.nextCursor).toEqual(expect.any(String));
    }

    const completed = await provider.completeUploadSession(
      { uploadSessionId: 'upl_0001' },
      { principalId: 'user_123', tenantId: 'org_123', requestId: 'req_complete' },
    ) as any;
    expect(completed).toMatchObject({
      fileId: expect.any(String),
      versionId: expect.any(String),
    });
  });
});
