import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const LEGACY_SOURCE_PATH = new URL('../src/auth/oauth-flow.ts', import.meta.url);

describe('PlugFn legacy OAuth shim', () => {
  it('emits deterministic deprecation guidance on import', async () => {
    vi.resetModules();
    const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined as never);

    const mod = await import('../src/auth/oauth-flow.js');
    const notice = mod.getLegacyOAuthFlowDeprecationNotice();

    expect(warningSpy).toHaveBeenCalledWith(notice.message, {
      code: notice.code,
      type: 'DeprecationWarning',
    });
    expect(notice).toEqual({
      code: 'DEPRECATED_PATH',
      message: expect.stringContaining('plugfn/auth/oauth-flow is deprecated'),
      replacement: '@superfunctions/oauth-flow',
      removalTarget: 'plugfn@0.2.0',
    });

    warningSpy.mockRestore();
  });

  it('delegates all legacy methods without owning orchestration logic', async () => {
    vi.resetModules();
    const { OAuthFlowHandler } = await import('../src/auth/oauth-flow.js');
    const delegate = {
      getAuthorizationUrl: vi.fn(async () => ({ url: 'https://example.test/auth', state: 'st_01' })),
      exchangeCodeForToken: vi.fn(async () => ({ access_token: 'token-1' })),
      refreshAccessToken: vi.fn(async () => ({ access_token: 'token-2' })),
      verifyState: vi.fn(async () => ({
        userId: 'user-1',
        provider: 'github',
        redirectUri: 'https://example.test/callback',
        scopes: ['repo'],
        timestamp: 1,
      })),
    };

    const handler = new OAuthFlowHandler(delegate as any);
    expect(
      await handler.getAuthorizationUrl(
        {
          authorizationUrl: 'https://example.test/auth',
          tokenUrl: 'https://example.test/token',
          scopes: ['repo'],
        },
        {
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'https://example.test/callback',
          scopes: ['repo'],
        }
      )
    ).toEqual({ url: 'https://example.test/auth', state: 'st_01' });
    expect(
      await handler.exchangeCodeForToken(
        {
          authorizationUrl: 'https://example.test/auth',
          tokenUrl: 'https://example.test/token',
          scopes: ['repo'],
        },
        {
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'https://example.test/callback',
          scopes: ['repo'],
        },
        'code-1'
      )
    ).toEqual({ access_token: 'token-1' });
    expect(
      await handler.refreshAccessToken(
        {
          authorizationUrl: 'https://example.test/auth',
          tokenUrl: 'https://example.test/token',
          scopes: ['repo'],
        },
        {
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'https://example.test/callback',
          scopes: ['repo'],
        },
        'refresh-1'
      )
    ).toEqual({ access_token: 'token-2' });
    expect(await handler.verifyState('st_01')).toEqual({
      userId: 'user-1',
      provider: 'github',
      redirectUri: 'https://example.test/callback',
      scopes: ['repo'],
      timestamp: 1,
    });

    expect(delegate.getAuthorizationUrl).toHaveBeenCalledTimes(1);
    expect(delegate.exchangeCodeForToken).toHaveBeenCalledTimes(1);
    expect(delegate.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(delegate.verifyState).toHaveBeenCalledTimes(1);
  });

  it('keeps banned orchestration symbols out of the legacy file', () => {
    const source = readFileSync(LEGACY_SOURCE_PATH, 'utf8');

    expect(source).not.toMatch(/exchangeToken/);
    expect(source).not.toMatch(/refreshToken/);
    expect(source).not.toMatch(/MemoryOAuthStateStore/);
    expect(source).not.toMatch(/DefaultOAuthService/);
  });
});
