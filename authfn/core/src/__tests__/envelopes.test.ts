import { describe, expect, it } from 'vitest';
import { errorEnvelope, jsonError } from '../http/envelopes.js';

describe('@authfn/core envelopes', () => {
  it('preserves authfn-shaped errors from another realm', async () => {
    const request = new Request('https://account.example.com/auth/session');
    const foreignAuthError = {
      code: 'AUTHFN_VALIDATION_ERROR',
      message: 'Email is invalid',
      retryable: false,
      status: 400,
      details: {
        field: 'email'
      }
    };

    const envelope = errorEnvelope('req_cross_realm', foreignAuthError);
    expect(envelope).toEqual({
      ok: false,
      error: {
        code: 'AUTHFN_VALIDATION_ERROR',
        message: 'Email is invalid',
        retryable: false,
        details: {
          field: 'email'
        }
      },
      requestId: 'req_cross_realm'
    });

    const response = jsonError(request, foreignAuthError);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ...envelope,
      requestId: expect.any(String)
    });
  });

  it('falls back to 500 when a foreign authfn-shaped error carries an invalid status', async () => {
    const request = new Request('https://account.example.com/auth/session');
    const response = jsonError(request, {
      code: 'AUTHFN_VALIDATION_ERROR',
      message: 'Email is invalid',
      retryable: false,
      status: 999,
      details: {
        field: 'email'
      }
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUTHFN_VALIDATION_ERROR',
        message: 'Email is invalid',
        retryable: false,
        details: {
          field: 'email'
        }
      },
      requestId: expect.any(String)
    });
  });

  it('falls back to 500 when a foreign authfn-shaped error carries a no-body status', async () => {
    const request = new Request('https://account.example.com/auth/session');
    const response = jsonError(request, {
      code: 'AUTHFN_VALIDATION_ERROR',
      message: 'Email is invalid',
      retryable: false,
      status: 204,
      details: {
        field: 'email'
      }
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUTHFN_VALIDATION_ERROR',
        message: 'Email is invalid',
        retryable: false,
        details: {
          field: 'email'
        }
      },
      requestId: expect.any(String)
    });
  });

  it('still sanitizes oauth-shaped errors through the mapper', async () => {
    const request = new Request('https://account.example.com/auth/session');
    const response = jsonError(request, {
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
      message: 'bearer token exchange failed',
      details: {
        accessToken: 'secret-token'
      }
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUTHFN_INTERNAL_ERROR',
        message: 'OAuth token exchange failed',
        retryable: true,
        details: {
          accessToken: '[REDACTED]'
        }
      },
      requestId: expect.any(String)
    });
  });
});
