import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { listAuthFnAdminUsers } from '../core/admin-users.js';

function cursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('AuthFn admin user cursors', () => {
  it('accepts legacy position-only cursors while retaining binding for new cursor envelopes', async () => {
    const config = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [],
    };
    const position = { createdAt: '2026-01-01T00:00:00.000Z', id: 'user_legacy' };

    await expect(listAuthFnAdminUsers(config, {
      cursor: cursor(position),
      direction: 'asc',
      email: 'legacy@example.test',
      regionId: 'eu-west-1',
    })).resolves.toMatchObject({ users: [], pageInfo: { hasMore: false } });

    await expect(listAuthFnAdminUsers(config, {
      cursor: cursor({ ...position, direction: 'desc', email: null, regionId: null }),
      direction: 'asc',
    })).rejects.toMatchObject({ code: 'AUTHFN_VALIDATION_ERROR' });

    await expect(listAuthFnAdminUsers(config, {
      cursor: cursor({ ...position, direction: 'asc' }),
      direction: 'asc',
    })).rejects.toMatchObject({ code: 'AUTHFN_VALIDATION_ERROR' });
  });
});
