import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryAdapter } from '@superfunctions/db/adapters/memory';
import { createLocalStorageAdapter } from '@superfunctions/storage-local';
import { describe, expect, it } from 'vitest';
import { createFileFn, type Processor } from '../src/index.js';

describe('public FileFn services', () => {
  it('shares real storage, policies, events and authorization with the facade', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'filefn-services-'));
    try {
      const processors: Processor[] = [];
      const fileFn = createFileFn({
        database: memoryAdapter(),
        storage: createLocalStorageAdapter({ rootDir }),
        namespace: 'services_test',
        policies: [{ name: 'text', contentTypes: ['text/plain'], visibility: 'private' }],
        processing: { enabled: true, processors },
      });
      const owner = { principalId: 'owner', tenantId: 'tenant', requestId: 'services_test' };
      const stranger = { principalId: 'stranger', tenantId: 'other' };
      const uploaded: string[] = [];
      const deleted: string[] = [];
      fileFn.events.on('file:uploaded', (event) => uploaded.push(event.fileId));
      fileFn.events.on('file:deleted', (event) => deleted.push(event.fileId));

      fileFn.definePolicy('note', { contentTypes: ['text/plain'], visibility: 'private' });
      expect(fileFn.services.policies.get('note')?.name).toBe('note');
      fileFn.services.policies.define('service-note', { contentTypes: ['text/plain'] });
      expect(fileFn.services.policies.list().map((policy) => policy.name)).toContain('service-note');

      const body = Buffer.from('real service bytes');
      const session = await fileFn.createUploadSession({
        policy: 'note', fileName: 'note.txt', size: body.length, mimeType: 'text/plain',
      }, owner);
      const part = await fileFn.services.uploads.uploadPartBytes(session.uploadSessionId, 1, body, body.length, owner);
      await fileFn.completeUploadPart({
        uploadSessionId: session.uploadSessionId, partNumber: 1, etag: part.etag, size: part.size,
      }, owner);
      const result = await fileFn.completeUploadSession({ uploadSessionId: session.uploadSessionId }, owner);
      expect(uploaded).toEqual([result.fileId]);
      expect((await fileFn.services.files.listVersions(result.fileId, owner)).versions[0].versionId).toBe(result.versionId);
      expect((await fileFn.listFiles({}, owner)).files.map((file) => file.fileId)).toContain(result.fileId);
      const download = await fileFn.services.files.getDownloadStream(result.fileId, undefined, owner);
      expect(await new Response(download.stream).text()).toBe(body.toString());

      await expect(fileFn.services.files.listVersions(result.fileId, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await expect(fileFn.services.grants.listGrants(result.fileId, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await expect(fileFn.services.shares.createShareLink({ fileId: result.fileId }, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await expect(fileFn.services.processing.triggerProcessingForFile(result.fileId, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });

      const grant = await fileFn.services.grants.createGrant({ fileId: result.fileId, userId: 'reader' }, owner);
      expect((await fileFn.services.grants.listGrants(result.fileId, owner))[0].permissionId).toBe(grant.permissionId);
      expect((await fileFn.getFile({ fileId: result.fileId }, { principalId: 'reader' })).fileId).toBe(result.fileId);
      await fileFn.services.grants.revokeGrant(result.fileId, grant.permissionId, owner);
      await expect(fileFn.getFile({ fileId: result.fileId }, { principalId: 'reader' })).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });

      const share = await fileFn.services.shares.createShareLink({ fileId: result.fileId }, owner);
      expect(await fileFn.services.shares.listShareLinks(result.fileId, owner)).toHaveLength(1);
      await fileFn.services.shares.revokeShareLink(result.fileId, share.token, owner);
      await expect(fileFn.services.shares.downloadViaShareLink(share.token, {})).rejects.toMatchObject({ code: 'FILEFN_SHARE_REVOKED' });

      processors.push({
        name: 'uppercase',
        supportedMimeTypes: ['text/plain'],
        async process(input, getData) {
          const source = new TextDecoder().decode(await getData());
          return {
            success: true,
            artifacts: [{ kind: 'uppercase', data: new TextEncoder().encode(source.toUpperCase()), mimeType: 'text/plain', storageKey: `${input.storageKey}.uppercase` }],
          };
        },
      });
      const processed = new Promise<void>((resolve, reject) => {
        fileFn.events.once('processing.completed', () => resolve());
        fileFn.events.once('processing.failed', (event) => reject(new Error(event.error)));
      });
      await fileFn.services.processing.triggerProcessingForFile(result.fileId, owner, result.versionId);
      await processed;
      const artifacts = await fileFn.services.processing.listArtifactsForFile(result.fileId, owner);
      expect(artifacts).toHaveLength(1);
      const artifact = await fileFn.services.processing.getArtifactDownloadStreamForFile(result.fileId, artifacts[0].artifactId, owner);
      expect(await new Response(artifact.stream).text()).toBe(body.toString().toUpperCase());
      await expect(fileFn.services.processing.listArtifactsForFile(result.fileId, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });

      await fileFn.deleteFile({ fileId: result.fileId }, owner);
      expect(deleted).toEqual([result.fileId]);
      await expect(fileFn.services.files.getFile(result.fileId, owner)).rejects.toMatchObject({ code: 'FILEFN_NOT_FOUND' });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
