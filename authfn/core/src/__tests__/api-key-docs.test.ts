import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { authFnApiKeyPlugin } from '@authfn/api-keys';
import { createRouter } from '@superfunctions/http';
import { memoryAdapter } from '../../../../packages/db/src/adapters/memory/index.js';
import type { AuthFnRuntimeConfig, AuthFnServer, AuthFnSession } from '../index.js';
import { createApiKey, revokeApiKeyById } from '../core/api-keys.js';
import { createAuthFnRouter } from '../http/router.js';
import { createTestServer } from './test-server.js';

type Handler = (request: Request) => Promise<Response>;
type ProtectedWork = (request: Request) => Response;

function readGuide(guide: 'plugin' | 'cli'): string {
  const path = guide === 'plugin' ? 'plugins/api-keys.md' : 'recipes/cli-auth.md';
  return readFileSync(new URL(`../../../docs/content/docs/${path}`, import.meta.url), 'utf8');
}

function readBlock(text: string, prefix: string): string {
  const block = [...text.matchAll(/```ts\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .find((code) => code.includes(prefix));
  if (!block) throw new Error(`Missing documented example: ${prefix}`);
  return block;
}

function compile(code: string): string {
  // Type-only imports are checked separately and have no runtime dependency.
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
    .outputText.replace(/^export \{\};\s*$/gm, '');
}

function scopeExample(guide: 'plugin' | 'cli'): string {
  const text = readGuide(guide);
  const helper = readBlock(text, 'function hasScope');
  if (guide === 'plugin') return helper;
  const route = readBlock(text, "app.get('/projects'");
  return route === helper ? route : `${helper}\n${route}`;
}

function documentedHandler(guide: 'plugin' | 'cli', auth: AuthFnServer, protectedWork: ProtectedWork): Handler {
  const text = readGuide(guide);
  const helper = readBlock(text, 'function hasScope');
  if (guide === 'plugin') {
    return new Function('auth', 'handleAuthorizedRequest', `${compile(helper)}\nreturn handleRepositoryRequest;`)(auth, protectedWork);
  }

  type Context = { req: { raw: Request }; json: (data: unknown, status?: number) => Response };
  let handler: ((context: Context) => Promise<Response>) | undefined;
  const app = {
    get(_path: string, incoming: (context: Context) => Promise<Response>) {
      handler = incoming;
    }
  };
  new Function('app', 'auth', compile(scopeExample(guide)))(app, auth);
  return async (request) => {
    if (!handler) throw new Error('CLI example did not register its route');
    return handler({
      req: { raw: request },
      json(data, status = 200) {
        if (status === 200) protectedWork(request);
        return Response.json(data, { status });
      }
    });
  };
}

describe.each(['plugin', 'cli'] as const)('%s API-key documentation HTTP boundary', (guide) => {
  it.each([null, 'user:docs'])('distinguishes invalid credentials from valid keys at the host HTTP boundary (owner %s)', async (userId) => {
    const config: AuthFnRuntimeConfig = { database: memoryAdapter({ debug: false }), namespace: 'authfn', plugins: [authFnApiKeyPlugin()] };
    const auth = createTestServer(config);
    const protectedWork = vi.fn(() => Response.json({ allowed: true }));
    const handler = documentedHandler(guide, auth, protectedWork);
    const onError = vi.fn(async () => Response.json({ error: 'internal' }, { status: 500 }));
    const router = createRouter({ basePath: '/app', routes: [{ method: 'GET', path: '/doc-example', handler }], onError });
    const revoked = await createApiKey(config, { userId, name: 'revoked', scopes: ['repo:read', 'read'] });
    await revokeApiKeyById(config, revoked.keyId);
    const expired = await createApiKey(config, { userId, name: 'expired', scopes: ['repo:read', 'read'], expiresAt: new Date(0) });

    for (const authorization of [`Bearer ${revoked.secret}`, `Api-Key ${revoked.secret}`, `Bearer ${expired.secret}`, 'Bearer unknown-key', 'Basic invalid', undefined]) {
      const request = new Request('https://example.com/app/doc-example', {
        headers: authorization ? { authorization } : {}
      });
      const response = await router.handle(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
      expect(protectedWork).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    }

    const valid = await createApiKey(config, { userId, name: 'valid-control', scopes: ['repo:read', 'read'] });
    const response = await router.handle(new Request('https://example.com/app/doc-example', {
      headers: { authorization: `Bearer ${valid.secret}` }
    }));
    expect(response.status).toBe(200);
    expect(protectedWork).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('propagates unexpected authentication and protected-handler failures to the host', async () => {
    const config: AuthFnRuntimeConfig = { database: memoryAdapter({ debug: false }), namespace: 'authfn', plugins: [authFnApiKeyPlugin()] };
    const auth = createTestServer(config);
    const protectedWork = vi.fn(() => Response.json({ allowed: true }));
    const handler = documentedHandler(guide, auth, protectedWork);
    const onError = vi.fn(async (_error: unknown) => Response.json({ error: 'internal' }, { status: 500 }));
    const router = createRouter({ basePath: '/app', routes: [{ method: 'GET', path: '/doc-example', handler }], onError });
    const key = await createApiKey(config, { userId: null, name: 'valid', scopes: ['repo:read', 'read'] });
    const request = () => new Request('https://example.com/app/doc-example', { headers: { authorization: `Bearer ${key.secret}` } });
    const failure = new Error('database unavailable');
    const database = vi.spyOn(config.database, 'findOne').mockRejectedValue(failure);
    try {
      await expect(handler(request())).rejects.toBe(failure);
      expect((await router.handle(request())).status).toBe(500);
      expect(onError.mock.calls[0]?.[0]).toBe(failure);
      expect(protectedWork).not.toHaveBeenCalled();
    } finally {
      database.mockRestore();
    }

    const applicationFailure = Object.assign(new Error('protected application work failed'), { code: 'AUTHFN_API_KEY_REVOKED' });
    protectedWork.mockImplementation(() => { throw applicationFailure; });
    await expect(handler(request())).rejects.toBe(applicationFailure);
    expect((await router.handle(request())).status).toBe(500);
    expect(onError.mock.calls[1]?.[0]).toBe(applicationFailure);
  });

  it.each([null, 'user:docs'])('returns 403 without protected work for denied scopes (owner %s)', async (userId) => {
    const config: AuthFnRuntimeConfig = { database: memoryAdapter({ debug: false }), namespace: 'authfn', plugins: [authFnApiKeyPlugin()] };
    const auth = createTestServer(config);
    const protectedWork = vi.fn(() => Response.json({ allowed: true }));
    const handler = documentedHandler(guide, auth, protectedWork);
    const router = createAuthFnRouter(config, {}, [{ method: 'GET', path: '/doc-example', handler }]);
    const required = guide === 'plugin' ? 'repo:read' : 'read';

    for (const scopes of [undefined, [], [`${required}:other`], [required]]) {
      protectedWork.mockClear();
      const key = await createApiKey(config, {
        userId,
        name: 'docs-example',
        scopes,
        metadata: { scopes: [required] }
      });
      const response = await router.handle(new Request('https://example.com/auth/doc-example', {
        headers: { authorization: `Bearer ${key.secret}` }
      }));
      const allowed = scopes?.includes(required) ?? false;
      expect(response.status).toBe(allowed ? 200 : 403);
      expect(protectedWork).toHaveBeenCalledTimes(allowed ? 1 : 0);
      if (!allowed) expect(await response.json()).toEqual({ error: 'forbidden' });
    }

    protectedWork.mockClear();
    const unauthenticated = await router.handle(new Request('https://example.com/auth/doc-example'));
    expect(unauthenticated.status).toBe(401);
    expect(protectedWork).not.toHaveBeenCalled();
  });

  it('returns 403 for malformed scope metadata even when subject attributes claim a grant', async () => {
    const config: AuthFnRuntimeConfig = { database: memoryAdapter({ debug: false }), plugins: [authFnApiKeyPlugin()] };
    const auth = createTestServer(config);
    const protectedWork = vi.fn(() => Response.json({ allowed: true }));
    const required = guide === 'plugin' ? 'repo:read' : 'read';
    for (const scopes of [undefined, null, required, {}]) {
      const authenticate = vi.spyOn(auth.provider, 'authenticate').mockResolvedValue({
        id: 'key', type: 'api-key', actorType: 'api-key', actorId: 'key', resourceIds: [], methods: ['api-key'],
        subject: { actorType: 'api-key', actorId: 'key', attributes: { scopes: [required] } },
        metadata: { scopes }
      });
      try {
        const handler = documentedHandler(guide, auth, protectedWork);
        const router = createAuthFnRouter(config, {}, [{ method: 'GET', path: '/doc-example', handler }]);
        const response = await router.handle(new Request('https://example.com/auth/doc-example'));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'forbidden' });
        expect(protectedWork).not.toHaveBeenCalled();
      } finally {
        authenticate.mockRestore();
      }
    }
  });

  it('rejects user sessions even if their metadata contains matching scopes', async () => {
    const config: AuthFnRuntimeConfig = { database: memoryAdapter({ debug: false }), plugins: [authFnApiKeyPlugin()] };
    const auth = createTestServer(config);
    const session: AuthFnSession = {
      id: 'session', type: 'session', actorType: 'user', actorId: 'user', resourceIds: [], methods: ['password'],
      subject: { actorType: 'user', actorId: 'user' }, metadata: { scopes: ['repo:read', 'read'] }
    };
    const authenticate = vi.spyOn(auth.provider, 'authenticate').mockResolvedValue(session);
    try {
      const protectedWork = vi.fn(() => Response.json({ allowed: true }));
      const handler = documentedHandler(guide, auth, protectedWork);
      const router = createAuthFnRouter(config, {}, [{ method: 'GET', path: '/doc-example', handler }]);
      const response = await router.handle(new Request('https://example.com/auth/doc-example'));
      expect(response.status).toBe(401);
      expect(protectedWork).not.toHaveBeenCalled();
    } finally {
      authenticate.mockRestore();
    }
  });

  it('keeps executable scope examples synchronized in the generated reference', () => {
    const generated = readFileSync(new URL('../../../docs/static/llms-full.txt', import.meta.url), 'utf8');
    const text = readGuide(guide);
    expect(generated).toContain(readBlock(text, 'function hasScope'));
    if (guide === 'cli') expect(generated).toContain(readBlock(text, "app.get('/projects'"));
  });

  it('typechecks the copyable scope example with only documented application dependencies', () => {
    const fileName = fileURLToPath(new URL(`../../__docs_scope_${guide}.ts`, import.meta.url));
    const source = `
      declare const auth: import('authfn').AuthFnServer;
      declare const handleAuthorizedRequest: (request: Request, session: import('authfn').AuthFnSession) => Response | Promise<Response>;
      declare const app: {
        get(path: string, handler: (context: { req: { raw: Request }; json(data: unknown, status?: number): Response }) => Promise<Response>): void;
      };
      ${scopeExample(guide)}
    `;
    const options: ts.CompilerOptions = {
      noEmit: true, strict: true, skipLibCheck: true, types: [],
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, ...args) => name === fileName
      ? ts.createSourceFile(name, source, options.target!, true)
      : getSourceFile(name, ...args);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([fileName], options, host));
    expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([]);
  });
});
