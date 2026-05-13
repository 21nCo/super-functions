import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  authFnMultiRegionPlugin,
  authFnNativeHandoffPlugin,
  authFnPasswordPlugin,
  createAuthFn,
  type AuthFnConfig
} from '../index.js';

function createCookieJar() {
  const values = new Map<string, string>();

  return {
    header(): string {
      return Array.from(values.entries())
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; ');
    },
    csrf(): string {
      for (const [name, value] of values.entries()) {
        if (name.endsWith('.csrf')) {
          return value;
        }
      }
      return '';
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

function createConfig(database = memoryAdapter({ debug: false })): AuthFnConfig {
  return {
    database,
    namespace: 'authfn',
    plugins: [
      authFnPasswordPlugin(),
      authFnMultiRegionPlugin({
        regions: [
          {
            regionId: 'us-east-1',
            authority: 'https://us.account.example.com',
            hosts: ['us.account.example.com']
          }
        ]
      }),
      authFnNativeHandoffPlugin()
    ]
  };
}

describe('@authfn/core native handoff plugin', () => {
  it('can create native handoff codes from bearer web sessions for embedded WebViews', async () => {
    const auth = createAuthFn(createConfig());
    const dispatch = async (
      path: string,
      init: {
        method?: string;
        body?: Record<string, unknown>;
        bearerToken?: string;
      } = {}
    ) => {
      const headers = new Headers();
      if (init.body !== undefined) {
        headers.set('content-type', 'application/json');
      }
      if (init.bearerToken) {
        headers.set('authorization', `Bearer ${init.bearerToken}`);
      }
      return auth.router.handle(
        new Request(`https://us.account.example.com/auth${path}`, {
          method: init.method,
          headers,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined
        })
      );
    };

    const signUp = await dispatch('/sign-up/password', {
      method: 'POST',
      body: {
        email: 'embed@example.com',
        password: 'Sup3rSecurePassphrase!',
        sessionMode: 'hybrid'
      }
    });
    expect(signUp.status).toBe(200);
    const signUpBody = await signUp.json();
    expect(signUpBody.data.token).toMatch(/^st_/);

    const nativeStart = await dispatch('/handoff/native/start', {
      method: 'POST',
      bearerToken: signUpBody.data.token
    });
    expect(nativeStart.status).toBe(200);
    const nativeStartBody = await nativeStart.json();
    expect(nativeStartBody.data.code).toMatch(/^hf_/);
  });

  it('guards handoff code consumption with consumedAt for single-use exchanges', async () => {
    const database = memoryAdapter({ debug: false });
    const handoffUpdates: unknown[] = [];
    const auth = createAuthFn(createConfig({
      ...database,
      async update(params) {
        if (params.model === 'native_handoff_codes') {
          handoffUpdates.push(params);
        }
        return database.update(params);
      }
    }));
    const dispatch = async (
      path: string,
      init: {
        method?: string;
        body?: Record<string, unknown>;
        bearerToken?: string;
      } = {}
    ) => {
      const headers = new Headers();
      if (init.body !== undefined) {
        headers.set('content-type', 'application/json');
      }
      if (init.bearerToken) {
        headers.set('authorization', `Bearer ${init.bearerToken}`);
      }
      return auth.router.handle(
        new Request(`https://us.account.example.com/auth${path}`, {
          method: init.method,
          headers,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined
        })
      );
    };

    const signUp = await dispatch('/sign-up/password', {
      method: 'POST',
      body: {
        email: 'single-use@example.com',
        password: 'Sup3rSecurePassphrase!',
        sessionMode: 'hybrid'
      }
    });
    const signUpBody = await signUp.json();
    const start = await dispatch('/handoff/native/start', {
      method: 'POST',
      bearerToken: signUpBody.data.token
    });
    const startBody = await start.json();
    const exchange = await dispatch('/handoff/native/exchange', {
      method: 'POST',
      body: {
        code: startBody.data.code
      }
    });

    expect(exchange.status).toBe(200);
    expect(handoffUpdates).toContainEqual(expect.objectContaining({
      model: 'native_handoff_codes',
      where: expect.arrayContaining([
        expect.objectContaining({ field: 'consumedAt', operator: 'eq', value: null })
      ])
    }));
  });

  it('exchanges web cookie sessions to native bearer sessions and back to web cookies', async () => {
    const auth = createAuthFn(createConfig());
    const cookieJar = createCookieJar();

    const dispatch = async (
      path: string,
      init: {
        method?: string;
        body?: Record<string, unknown>;
        headers?: HeadersInit;
        bearerToken?: string;
      } = {}
    ) => {
      const headers = new Headers(init.headers);
      if (init.body !== undefined) {
        headers.set('content-type', 'application/json');
      }
      const cookieHeader = cookieJar.header();
      if (cookieHeader) {
        headers.set('cookie', cookieHeader);
      }
      if (init.bearerToken) {
        headers.set('authorization', `Bearer ${init.bearerToken}`);
      }

      const response = await auth.router.handle(
        new Request(`https://us.account.example.com/auth${path}`, {
          method: init.method,
          headers,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined
        })
      );
      cookieJar.applySetCookies(response.headers.getSetCookie());
      return response;
    };

    const signUp = await dispatch('/sign-up/password', {
      method: 'POST',
      body: {
        email: 'ada@example.com',
        password: 'Sup3rSecurePassphrase!'
      }
    });
    expect(signUp.status).toBe(200);

    const nativeStart = await dispatch('/handoff/native/start', {
      method: 'POST',
      headers: {
        'x-authfn-csrf': cookieJar.csrf()
      }
    });
    expect(nativeStart.status).toBe(200);
    const nativeStartBody = await nativeStart.json();
    const nativeCode = nativeStartBody.data.code;

    const nativeExchange = await dispatch('/handoff/native/exchange', {
      method: 'POST',
      body: {
        code: nativeCode,
        device: {
          platform: 'ios'
        }
      }
    });
    expect(nativeExchange.status).toBe(200);
    const nativeExchangeBody = await nativeExchange.json();
    expect(nativeExchangeBody.data.token).toMatch(/^st_/);
    expect(nativeExchangeBody.data.session.regionId).toBe('us-east-1');

    const replay = await dispatch('/handoff/native/exchange', {
      method: 'POST',
      body: {
        code: nativeCode
      }
    });
    expect(replay.status).toBe(409);

    const webStart = await dispatch('/handoff/web/start', {
      method: 'POST',
      bearerToken: nativeExchangeBody.data.token,
      body: {
        returnTo: '/app'
      }
    });
    expect(webStart.status).toBe(200);
    const webStartBody = await webStart.json();
    expect(webStartBody.data.consumeUrl).toContain('/auth/handoff/web/consume?code=');

    const consumeResponse = await auth.router.handle(new Request(webStartBody.data.consumeUrl));
    expect(consumeResponse.status).toBe(302);
    expect(consumeResponse.headers.get('location')).toBe('/app');
    expect(consumeResponse.headers.getSetCookie().some((cookie) => cookie.includes('.session='))).toBe(true);
  });
});
