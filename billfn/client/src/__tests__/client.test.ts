import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createBillFnClient } from '../index.js';
import type { BillFnClient } from '../types.js';

async function withServer(handler: RequestListener, consume: (client: BillFnClient) => Promise<void>, fetchImpl: typeof fetch = fetch) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a bound local HTTP server');

  try {
    await consume(createBillFnClient({ baseUrl: `http://127.0.0.1:${address.port}/billfn`, fetch: fetchImpl }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe('@billfn/client over HTTP', () => {
  it('returns a retryable network envelope when the response body disconnects after headers', async () => {
    let disconnect!: () => void;
    await withServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': '4096' });
      response.flushHeaders();
      response.write('{"ok":true,"data":');
      disconnect = () => response.destroy();
    }, async client => {
      await expect(client.getCatalog()).resolves.toMatchObject({
        ok: false,
        error: { code: 'BILLFN_NETWORK_ERROR', status: 503, retryable: true },
        meta: { timestamp: expect.any(String) }
      });
    }, async (input, init) => {
      const response = await fetch(input, init);
      // Fetch has received the real headers; disconnect before the client reads the body.
      disconnect();
      return response;
    });
  });

  it('reads a canonical catalog from a bound HTTP server', async () => {
    const catalog = { plans: [{ productKey: 'reports', planKey: 'pro', displayName: 'Pro', features: { export: true }, limits: { reports: 25 }, prices: [] }] };
    await withServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, data: catalog, meta: { timestamp: '2026-10-04T00:00:00.000Z' } }));
    }, async client => {
      await expect(client.getCatalog()).resolves.toEqual({
        ok: true,
        data: catalog,
        meta: { timestamp: '2026-10-04T00:00:00.000Z' }
      });
    });
  });

  it('normalizes a legacy provider error using the real HTTP response status', async () => {
    await withServer((_request, response) => {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: { code: 'BILLFN_PROVIDER_ERROR', message: 'Billing provider unavailable' } }));
    }, async client => {
      await expect(client.getEntitlements()).resolves.toMatchObject({
        ok: false,
        error: { code: 'BILLFN_PROVIDER_ERROR', message: 'Billing provider unavailable', status: 503, retryable: true },
        meta: { timestamp: expect.any(String) }
      });
    });
  });
});
