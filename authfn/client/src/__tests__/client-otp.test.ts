import { describe, expect, it } from 'vitest';
import { createTestServer } from './test-server.js';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import type { AuthFnRuntimeConfig, AuthFnDeliveryRequest } from 'authfn';
import { authFnEmailOtpPlugin } from '@authfn/email-otp';
import { authFnPasswordPlugin } from '@authfn/password';
import { createAuthFnClient } from '../index.js';
import { createAuthFnHttpClient } from '../http-client.js';

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

describe('@authfn/client otp flows', () => {
  it('treats empty error responses as failures', async () => {
    const client = createAuthFnHttpClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async () =>
        new Response(null, {
          status: 500,
          headers: {
            'x-request-id': 'req_empty'
          }
        })
    });

    const result = await client.requestJson({
      method: 'GET',
      path: '/session'
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('empty 500 response should be treated as an error');
    }
    expect(result.error.code).toBe('AUTHFN_INTERNAL_ERROR');
    expect(result.error.details?.status).toBe(500);
  });

  it('normalizes rejected fetch calls into an error envelope', async () => {
    const client = createAuthFnHttpClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async () => {
        throw new Error('socket closed');
      }
    });

    const result = await client.requestJson({
      method: 'GET',
      path: '/session'
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('rejected fetch should return an error envelope');
    }
    expect(result.error.code).toBe('AUTHFN_NETWORK_ERROR');
    expect(result.error.message).toBe('socket closed');
    expect(result.error.details?.name).toBe('Error');
  });

  it('treats invalid json payloads as envelope failures', async () => {
    const client = createAuthFnHttpClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async () =>
        new Response(JSON.stringify({ redirectTo: 'https://app.example.com/post-auth' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_invalid'
          }
        })
    });

    const result = await client.requestJson({
      method: 'GET',
      path: '/session'
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('invalid JSON payload should be rejected');
    }
    expect(result.error.code).toBe('AUTHFN_INTERNAL_ERROR');
    expect(result.requestId).toBe('req_invalid');
  });

  it('rejects malformed error envelopes that omit required fields', async () => {
    const client = createAuthFnHttpClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async () =>
        new Response(JSON.stringify({
          ok: false,
          error: {
            code: 'AUTHFN_INVALID_CREDENTIALS'
          },
          requestId: 'req_malformed'
        }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_malformed'
          }
        })
    });

    const result = await client.requestJson({
      method: 'GET',
      path: '/session'
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('malformed error envelopes should be rejected');
    }
    expect(result.error.code).toBe('AUTHFN_INTERNAL_ERROR');
    expect(result.requestId).toBe('req_malformed');
  });

  it('does not throw when csrf cookie encoding is malformed', async () => {
    const client = createAuthFnHttpClient({
      baseUrl: 'https://account.example.com/auth',
      cookieAccessor: () => 'authfn.session=session-token; authfn.csrf=bad%zzvalue',
      fetch: async (_input, init) => {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            receivedCsrf: new Headers(init?.headers).get('x-authfn-csrf')
          },
          requestId: 'req_cookie'
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        });
      }
    });

    const result = await client.requestJson<{
      ok: true;
      data: { receivedCsrf: string | null };
      requestId: string;
    }>({
      method: 'POST',
      path: '/sign-out',
      body: {},
      csrf: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('malformed cookie values should not break requestJson');
    }
    expect(result.data.receivedCsrf).toBe('bad%zzvalue');
  });

  it('supports verify-email, otp sign-in, and reset-password completion', async () => {
    const codes = new Map<string, string>();
    const provider = {
      async send(input: AuthFnDeliveryRequest) {
        codes.set(`${input.purpose}:${input.email}`, input.code);
        return { sent: true };
      }
    };

    const auth = createTestServer({
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnPasswordPlugin(),
        authFnEmailOtpPlugin()
      ],
      pluginRuntime: {
        password: {
          otp: {
            delivery: provider,
            codeGenerator: () => '731942'
          }
        },
        emailOtp: {
          delivery: provider,
          codeGenerator: () => '731942'
        }
      }
    } satisfies AuthFnRuntimeConfig);

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

    const signUpSent = await client.sendOtp({
      purpose: 'sign-up',
      email: 'otp-new@example.com'
    });
    expect(signUpSent.ok).toBe(true);

    const otpSignUp = await client.verifyOtp({
      purpose: 'sign-up',
      email: 'otp-new@example.com',
      code: codes.get('sign-up:otp-new@example.com')!,
      profile: {
        name: 'OTP New'
      },
      sessionMode: 'hybrid'
    });
    expect(otpSignUp.ok).toBe(true);
    if (!otpSignUp.ok || !('session' in otpSignUp.data)) {
      throw new Error('otp sign-up should yield a session envelope');
    }
    expect(otpSignUp.data.session?.methods).toEqual(['email-otp']);
    expect(otpSignUp.data.token).toEqual(expect.any(String));
    await client.signOut();

    await client.signUpWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    await client.signOut();

    const sent = await client.sendOtp({
      purpose: 'verify-email',
      email: 'ada@example.com'
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) {
      throw new Error('sendOtp should succeed');
    }

    const verified = await client.verifyOtp({
      purpose: 'verify-email',
      email: 'ada@example.com',
      code: codes.get('verify-email:ada@example.com')!
    });
    expect(verified.ok).toBe(true);

    await client.sendOtp({
      purpose: 'sign-in',
      email: 'ada@example.com'
    });
    const signedIn = await client.verifyOtp({
      purpose: 'sign-in',
      email: 'ada@example.com',
      code: codes.get('sign-in:ada@example.com')!
    });
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok || !('session' in signedIn.data)) {
      throw new Error('otp sign-in should yield a session envelope');
    }
    expect(signedIn.data.session?.methods).toEqual(['email-otp']);

    const currentSession = await client.getSession();
    expect(currentSession.ok).toBe(true);
    if (!currentSession.ok) {
      throw new Error('getSession should succeed');
    }
    expect(currentSession.data.session?.primaryEmail).toBe('ada@example.com');

    const resetStart = await client.startPasswordReset({
      email: 'ada@example.com'
    });
    expect(resetStart.ok).toBe(true);

    const resetComplete = await client.completePasswordReset({
      email: 'ada@example.com',
      code: codes.get('reset-password:ada@example.com')!,
      newPassword: 'An0therSecurePassphrase!'
    });
    expect(resetComplete.ok).toBe(true);
    if (!resetComplete.ok) {
      throw new Error('reset completion should succeed');
    }
    expect(resetComplete.data.passwordUpdated).toBe(true);

    await client.signOut();
    const wrongOldPassword = await client.signInWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    expect(wrongOldPassword.ok).toBe(false);
    if (wrongOldPassword.ok) {
      throw new Error('old password should fail');
    }
    expect(wrongOldPassword.error.code).toBe('AUTHFN_INVALID_CREDENTIALS');

    const newPassword = await client.signInWithPassword({
      email: 'ada@example.com',
      password: 'An0therSecurePassphrase!'
    });
    expect(newPassword.ok).toBe(true);
  });
});
