import { describe, expect, it } from 'vitest';
import { authFnApiKeyPlugin } from '@authfn/api-keys';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import type { AuthFnRuntimeConfig } from '../index.js';
import { issueSessionCookies } from '../core/cookies.js';
import { hashSecret, issueSession } from '../core/sessions.js';
import { createUser } from '../core/users.js';
import { createTestServer } from './test-server.js';

function cookieHeader(values: string[]): string {
  return values.map((value) => value.slice(0, value.indexOf(';'))).join('; ');
}

describe('AuthFn mutation authorization', () => {
  it('requires AuthFn CSRF for cookies and never downgrades a cookie to Authorization', async () => {
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn-mutation-authorization',
      plugins: [authFnApiKeyPlugin()],
    };
    const auth = createTestServer(config);
    const user = await createUser(config, { primaryEmail: 'operator@example.test' });
    const issued = await issueSession(config, {}, {
      request: new Request('https://console.example.test/api/admin/v1'),
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password'],
    });
    const cookie = cookieHeader(Object.values(issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken)));

    await expect(auth.authorizeMutation(new Request('https://console.example.test/api/admin/v1/modules/examplefn', {
      method: 'POST',
      headers: { cookie, 'x-authfn-csrf': issued.csrfToken },
    }))).resolves.toMatchObject({ actorId: user.id, type: 'session' });

    await expect(auth.authorizeMutation(new Request('https://console.example.test/api/admin/v1/modules/examplefn', {
      method: 'POST',
      headers: {
        cookie,
        authorization: `Bearer ${issued.sessionToken}`,
        'x-authfn-csrf': 'wrong-token',
      },
    }))).rejects.toMatchObject({ code: 'AUTHFN_CSRF_INVALID', status: 403 });

    await expect(auth.authorizeMutation(new Request('https://console.example.test/api/admin/v1/modules/examplefn', {
      method: 'POST',
      headers: { authorization: `Bearer ${issued.sessionToken}` },
    }))).resolves.toMatchObject({ actorId: user.id, type: 'session' });
  });

  it('allows an authenticated API key mutation without browser CSRF', async () => {
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn-api-key-mutation',
      plugins: [authFnApiKeyPlugin()],
    };
    const auth = createTestServer(config);
    await config.database.create({
      model: 'api_keys',
      namespace: config.namespace,
      data: {
        id: 'key_1',
        userId: null,
        name: 'automation',
        secretHash: hashSecret('api-key-secret'),
        scopes: ['admin'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await expect(auth.authorizeMutation(new Request('https://console.example.test/api/admin/v1/modules/examplefn', {
      method: 'POST',
      headers: { authorization: 'Bearer api-key-secret' },
    }))).resolves.toMatchObject({ actorId: 'key_1', type: 'api-key' });
  });
});
