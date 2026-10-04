import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryAdapter } from '@superfunctions/db/adapters/memory';
import { createLocalStorageAdapter } from '@superfunctions/storage-local';
import { createFileFn } from '@filefn/server';
import type { AdminOperationContext } from '@superfunctions/admin';
import { describe, expect, it } from 'vitest';
import { createFileFnDomainAdminService } from '../index.js';

const context: AdminOperationContext = {
  scope: { installationId: 'installation', workspaceId: 'workspace', projectId: 'tenant', environmentId: 'test' },
  actor: { id: 'owner', type: 'user', permissions: ['*'] },
  requestId: 'filefn_admin_integration',
  source: 'console',
};

describe('administration with the published FileFn server', () => {
  it('uses the bound services without bypassing domain authorization', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'filefn-admin-'));
    try {
      const fileFn = createFileFn({
        database: memoryAdapter(),
        storage: createLocalStorageAdapter({ rootDir }),
        namespace: 'admin_integration',
        policies: [{ name: 'text', contentTypes: ['text/plain'], visibility: 'private' }],
      });
      const admin = createFileFnDomainAdminService({
        fileFn,
        context: (active) => ({ principalId: active.actor.id, tenantId: active.scope.projectId }),
      });
      const body = Buffer.from('published server bytes');
      const created = await admin.createUpload({ policy: 'text', fileName: 'note.txt', size: body.length, mimeType: 'text/plain' }, context);
      if (!created.ok || !created.data.item) throw new Error('Upload session creation failed');
      const uploadSessionId = created.data.item.uploadSessionId;
      const owner = { principalId: context.actor.id, tenantId: context.scope.projectId };
      const part = await fileFn.services.uploads.uploadPartBytes(uploadSessionId, 1, body, body.length, owner);
      await fileFn.completeUploadPart({ uploadSessionId, partNumber: 1, etag: part.etag, size: part.size }, owner);
      const completed = await admin.completeUpload({ id: uploadSessionId }, context);
      if (!completed.ok || !completed.data.item) throw new Error('Upload completion failed');
      const { fileId, versionId } = completed.data.item;

      const versions = await admin.listVersions({ fileId }, context);
      expect(versions).toMatchObject({ ok: true, data: { items: [{ versionId, fileId }], nextCursor: null } });
      if (!versions.ok) throw new Error('Version listing failed');
      expect(versions.data.items[0]).not.toHaveProperty('storageKey');
      expect(await admin.downloadFile({ id: fileId }, context)).toMatchObject({ ok: true, data: { item: { url: `/proxy/files/${fileId}/download` } } });
      expect(await admin.listPolicies({}, context)).toMatchObject({ ok: true, data: { items: [{ name: 'text' }] } });
      expect(await admin.listArtifacts({ fileId }, context)).toMatchObject({ ok: true, data: { items: [] } });

      const grant = await admin.createGrant({ fileId, userId: 'reader' }, context);
      if (!grant.ok || !grant.data.item) throw new Error('Grant creation failed');
      expect(await admin.listGrants({ fileId }, context)).toMatchObject({ ok: true, data: { items: [{ permissionId: grant.data.item.permissionId }] } });
      await admin.revokeGrant({ fileId, id: grant.data.item.permissionId }, context);
      expect(await admin.listGrants({ fileId }, context)).toMatchObject({ ok: true, data: { items: [] } });

      const share = await admin.createShareLink({ fileId }, context);
      if (!share.ok || !share.data.item) throw new Error('Share creation failed');
      const shares = await admin.listShareLinks({ fileId }, context);
      expect(shares).toMatchObject({ ok: true, data: { items: [{ fileId, revokedAt: null }] } });
      if (!shares.ok) throw new Error('Share listing failed');
      expect(shares.data.items[0]).not.toHaveProperty('tokenHash');
      await admin.revokeShareLink({ fileId, token: share.data.item.token }, context);

      const stranger = { ...context, actor: { ...context.actor, id: 'stranger' }, scope: { ...context.scope, projectId: 'other' } };
      await expect(admin.listVersions({ fileId }, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await expect(admin.listGrants({ fileId }, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await expect(admin.createShareLink({ fileId }, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await expect(admin.processFile({ fileId }, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await expect(admin.deleteFile({ id: fileId }, stranger)).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
      await admin.deleteFile({ id: fileId }, context);
      await expect(fileFn.getFile({ fileId }, owner)).rejects.toMatchObject({ code: 'FILEFN_NOT_FOUND' });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
