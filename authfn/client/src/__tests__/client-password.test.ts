import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { authFnPasswordPlugin, createAuthFn, type AuthFnConfig } from '@authfn/core';
import { createAuthFnClient } from '../index.js';

function createConfig(): AuthFnConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [authFnPasswordPlugin()]
  };
}

function createCookieJar() {
  const values = new Map<string, string>();

  return {
    header(): string {
      return Array.from(values.entries())
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; ');
    },
    applySetCookies(cookies: string[]): void {
      for (const cookie of cookies) {
        const [pair] = cookie.split(';');
        const separatorIndex = pair.indexOf('=');
        const name = pair.slice(0, separatorIndex);
        const value = decodeURIComponent(pair.slice(separatorIndex + 1));
        if (value === '') {
          values.delete(name);
        } else {
          values.set(name, value);
        }
      }
    }
  };
}

describe('@authfn/client password flows', () => {
  it('uses cookie credentials by default and completes sign-up -> session -> sign-out', async () => {
    const auth = createAuthFn(createConfig());
    const cookieJar = createCookieJar();
    const observedCredentials: RequestCredentials[] = [];

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      cookieAccessor: () => cookieJar.header(),
      fetch: async (input, init) => {
        observedCredentials.push(init?.credentials ?? 'omit');
        const headers = new Headers(init?.headers);
        const cookieHeader = cookieJar.header();
        if (cookieHeader) {
          headers.set('cookie', cookieHeader);
        }

        const response = await auth.router.handle(
          new Request(typeof input === 'string' ? input : input.toString(), {
            method: init?.method,
            headers,
            body: init?.body
          })
        );
        cookieJar.applySetCookies(response.headers.getSetCookie());
        return response;
      }
    });

    const signUp = await client.signUpWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    if (!signUp.ok) {
      throw new Error('sign-up should have succeeded');
    }
    expect(signUp.data.session.primaryEmail).toBe('ada@example.com');

    const currentSession = await client.getSession();
    if (!currentSession.ok) {
      throw new Error('current session should have succeeded');
    }
    expect(currentSession.data.session?.methods).toEqual(['password']);

    const accountDetails = await client.getAccountDetails();
    if (!accountDetails.ok) {
      throw new Error(`account details should have succeeded: ${JSON.stringify(accountDetails)}`);
    }
    expect(accountDetails.data.user.primaryEmail).toBe('ada@example.com');
    expect(accountDetails.data.hasPassword).toBe(true);
    expect(accountDetails.data.methods.password).toBe(true);
    expect(accountDetails.data.oauthAccounts).toEqual([]);

    const signOut = await client.signOut();
    if (!signOut.ok) {
      throw new Error('sign-out should have succeeded');
    }
    expect(signOut.data.revoked).toBe(true);

    const postSignOut = await client.getSession();
    if (!postSignOut.ok) {
      throw new Error('post sign-out session fetch should have succeeded');
    }
    expect(postSignOut.data.session).toBeNull();
    expect(observedCredentials.every((value) => value === 'include')).toBe(true);
  });

  it('sends the csrf header from the readable csrf cookie on sign-out', async () => {
    const auth = createAuthFn(createConfig());
    const cookieJar = createCookieJar();
    let observedCsrfHeader: string | null = null;

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      cookieAccessor: () => cookieJar.header(),
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/sign-out')) {
          observedCsrfHeader = headers.get('x-authfn-csrf');
        }
        const cookieHeader = cookieJar.header();
        if (cookieHeader) {
          headers.set('cookie', cookieHeader);
        }

        const response = await auth.router.handle(
          new Request(url, {
            method: init?.method,
            headers,
            body: init?.body
          })
        );
        cookieJar.applySetCookies(response.headers.getSetCookie());
        return response;
      }
    });

    const signUp = await client.signUpWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    if (!signUp.ok) {
      throw new Error('sign-up should have succeeded');
    }

    await client.signOut();
    expect(observedCsrfHeader).toMatch(/^csrf_/);
  });

  it('uses an explicit cookie prefix when the session cookie is httpOnly and hidden from the accessor', async () => {
    const auth = createAuthFn({
      ...createConfig(),
      cookie: {
        prefix: 'demo-auth'
      }
    });
    const cookieJar = createCookieJar();
    let observedCsrfHeader: string | null = null;

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      cookieAccessor: () =>
        cookieJar
          .header()
          .split('; ')
          .filter((part) => !part.startsWith('demo-auth.session=') && !part.startsWith('__Secure-demo-auth.session='))
          .join('; '),
      cookiePrefix: 'demo-auth',
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/sign-out')) {
          observedCsrfHeader = headers.get('x-authfn-csrf');
        }

        const cookieHeader = cookieJar.header();
        if (cookieHeader) {
          headers.set('cookie', cookieHeader);
        }

        const response = await auth.router.handle(
          new Request(url, {
            method: init?.method,
            headers,
            body: init?.body
          })
        );
        cookieJar.applySetCookies(response.headers.getSetCookie());
        return response;
      }
    });

    const signUp = await client.signUpWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    if (!signUp.ok) {
      throw new Error('sign-up should have succeeded');
    }

    const signOut = await client.signOut();
    expect(observedCsrfHeader).toMatch(/^csrf_/);
    expect(signOut.ok).toBe(true);
  });

  it('returns canonical auth errors for wrong passwords', async () => {
    const auth = createAuthFn(createConfig());
    const cookieJar = createCookieJar();

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      cookieAccessor: () => cookieJar.header(),
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        const cookieHeader = cookieJar.header();
        if (cookieHeader) {
          headers.set('cookie', cookieHeader);
        }

        const response = await auth.router.handle(
          new Request(typeof input === 'string' ? input : input.toString(), {
            method: init?.method,
            headers,
            body: init?.body
          })
        );
        cookieJar.applySetCookies(response.headers.getSetCookie());
        return response;
      }
    });

    await client.signUpWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });

    const response = await client.signInWithPassword({
      email: 'ada@example.com',
      password: 'wrong-password'
    });

    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('wrong password should not have succeeded');
    }
    expect(response.error.code).toBe('AUTHFN_INVALID_CREDENTIALS');
    expect(response.error.message).toBe('Invalid email or password');
  });

  it('maps non-json backend failures into a canonical authfn error envelope', async () => {
    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async () =>
        new Response('upstream exploded', {
          status: 502,
          headers: {
            'content-type': 'text/plain',
            'x-request-id': 'req_non_json'
          }
        })
    });

    const response = await client.getSession();
    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('non-json failure should produce an authfn error envelope');
    }
    expect(response.error.code).toBe('AUTHFN_INTERNAL_ERROR');
    expect(response.requestId).toBe('req_non_json');
  });
});
