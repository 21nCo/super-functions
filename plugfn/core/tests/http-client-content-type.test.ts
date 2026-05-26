import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchHttpClient, HttpError } from '../src/utils/request.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('HTTP client content-type semantics', () => {
  it('serializes application/x-www-form-urlencoded payloads correctly', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      return new Response(JSON.stringify({ ok: true, body: init.body }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    });
    globalThis.fetch = fetchMock as any;

    const client = new FetchHttpClient();
    const response = await client.post(
      'https://example.com/token',
      {
        grant_type: 'refresh_token',
        refresh_token: 'rt',
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0][1];
    expect(String(call.body)).toContain('grant_type=refresh_token');
    expect(String(call.body)).toContain('refresh_token=rt');
    expect(String(call.body).startsWith('{')).toBe(false);
  });

  it('keeps JSON payloads serialized as JSON', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      return new Response(JSON.stringify({ ok: true, body: init.body }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    });
    globalThis.fetch = fetchMock as any;

    const client = new FetchHttpClient();
    await client.post('https://example.com/json', { hello: 'world' });

    const call = fetchMock.mock.calls[0][1];
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.body).toBe(JSON.stringify({ hello: 'world' }));
  });

  it('surfaces provider failures when serialization path is forced incorrectly', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      const body = String(init.body);
      if (body.startsWith('{')) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), {
          status: 400,
          statusText: 'Bad Request',
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    });
    globalThis.fetch = fetchMock as any;

    const client = new FetchHttpClient();

    await expect(
      client.post(
        'https://example.com/token',
        {
          grant_type: 'refresh_token',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          bodyEncoding: 'json',
        }
      )
    ).rejects.toBeInstanceOf(HttpError);
  });
});
