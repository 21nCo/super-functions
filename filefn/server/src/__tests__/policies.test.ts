import { describe, expect, it } from 'vitest';
import { computeStoragePath } from '../policies.js';

describe('policy storage paths', () => {
  it('TV-POLICY-001: sanitizes user-controlled path segments before joining', () => {
    const path = computeStoragePath(
      { name: 'user-avatar' },
      {
        tenantId: '../tenant',
        principalId: 'user/123',
        fileId: 'file\\id',
        versionId: 'ver/001',
        fileName: '../../avatar.png',
      },
    );

    expect(path).toBe('_tenant/user_123/file_id/ver_001-_avatar.png');
    expect(path).not.toContain('..');
    expect(path).not.toContain('\\');
  });
});
