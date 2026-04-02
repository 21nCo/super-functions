import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../router.js';

function createMockRoutes() {
  return {
    uploadRoutes: {
      initSession: vi.fn(async () => new Response('upload-init')),
      getStatus: vi.fn(async () => new Response('upload-status')),
      signPart: vi.fn(async () => new Response('upload-sign')),
      completePart: vi.fn(async () => new Response('upload-complete-part')),
      uploadPartBytes: vi.fn(async () => new Response('upload-part')),
      completeSession: vi.fn(async () => new Response('upload-complete')),
      abortSession: vi.fn(async () => new Response('upload-abort')),
    },
    fileRoutes: {
      listFiles: vi.fn(async () => new Response('list-files')),
      getFile: vi.fn(async () => new Response('get-file')),
      deleteFile: vi.fn(async () => new Response('delete-file')),
      downloadFile: vi.fn(async () => new Response('download-file')),
      renderFile: vi.fn(async () => new Response('render-file')),
      listVersions: vi.fn(async () => new Response('list-versions')),
      getVersion: vi.fn(async () => new Response('get-version')),
      proxyDownloadFile: vi.fn(async () => new Response('proxy-download-file')),
    },
    policyRoutes: {
      listPolicies: vi.fn(async () => new Response('policies')),
    },
    quotaRoutes: {
      getStorageQuota: vi.fn(async () => new Response('quota')),
    },
    grantsRoutes: {
      createGrant: vi.fn(async () => new Response('create-grant')),
      listGrants: vi.fn(async () => new Response('list-grants')),
      revokeGrant: vi.fn(async () => new Response('revoke-grant')),
    },
    sharesRoutes: {
      createShareLink: vi.fn(async () => new Response('create-share')),
      listShareLinks: vi.fn(async () => new Response('list-share')),
      downloadViaShareLink: vi.fn(async () => new Response('share-download')),
      revokeShareLink: vi.fn(async () => new Response('revoke-share')),
      proxyDownloadViaShareLink: vi.fn(async () => new Response('proxy-share-download')),
    },
    processingRoutes: {
      listArtifacts: vi.fn(async () => new Response('list-artifacts')),
      downloadArtifact: vi.fn(async () => new Response('download-artifact')),
      proxyDownloadArtifact: vi.fn(async () => new Response('proxy-download-artifact')),
      triggerProcessing: vi.fn(async () => new Response('trigger-processing')),
    },
  };
}

describe('createRouter', () => {
  it('does not let reserved top-level routes shadow explicit handlers', async () => {
    const routes = createMockRoutes();
    const router = createRouter(routes as any);

    const response = await router.handle(new Request('https://example.com/policies', { method: 'GET' }));

    expect(await response?.text()).toBe('policies');
    expect(routes.policyRoutes.listPolicies).toHaveBeenCalledTimes(1);
    expect(routes.fileRoutes.getFile).not.toHaveBeenCalled();
  });
});
