import { describe, expect, it } from 'vitest';
import { corsMiddleware } from './cors.js';

const okHandler = async () => new Response('ok', { status: 200 });

describe('corsMiddleware', () => {
  it('sets Vary: Origin when the allowed origin is an array (reflected)', async () => {
    const mw = corsMiddleware({ origin: ['https://app.example'] });
    const response = await mw(
      new Request('http://localhost/api', { headers: { Origin: 'https://app.example' } }),
      {},
      okHandler
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('sets Vary: Origin even when the request origin is not allowed', async () => {
    const mw = corsMiddleware({ origin: ['https://app.example'] });
    const response = await mw(
      new Request('http://localhost/api', { headers: { Origin: 'https://evil.example' } }),
      {},
      okHandler
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('rejects wildcard origin together with credentials', () => {
    expect(() => corsMiddleware({ origin: '*', credentials: true })).toThrow(
      'CORS_CREDENTIALS_WILDCARD_ORIGIN'
    );
    expect(() => corsMiddleware({ credentials: true })).toThrow(
      'CORS_CREDENTIALS_WILDCARD_ORIGIN'
    );
    expect(() => corsMiddleware({ origin: ['https://app.example', '*'], credentials: true })).toThrow(
      'CORS_CREDENTIALS_WILDCARD_ORIGIN'
    );
  });

  it('uses a static wildcard origin without Vary when credentials are disabled', async () => {
    const mw = corsMiddleware();
    const response = await mw(
      new Request('http://localhost/api', { headers: { Origin: 'https://app.example' } }),
      {},
      okHandler
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Vary')).toBeNull();
  });

  it('supports a wildcard inside an origin array when credentials are disabled', async () => {
    const mw = corsMiddleware({ origin: ['https://app.example', '*'] });
    const response = await mw(
      new Request('http://localhost/api', { headers: { Origin: 'https://other.example' } }),
      {},
      okHandler
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Vary')).toBeNull();
  });

  it('adds Vary: Origin to preflight responses for reflected origins', async () => {
    const mw = corsMiddleware({ origin: ['https://app.example'] });
    const response = await mw(
      new Request('http://localhost/api', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example' },
      }),
      {},
      okHandler
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
  });
});
