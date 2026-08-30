import { describe, expect, it, vi } from 'vitest';

import type { MailDomain } from '@mailfn/core';

import { CloudflareDomainAdapter } from './domain.js';

const domain = {
  id: 'dom_1', projectId: 'prj_1', domain: 'mail.example.com', status: 'pending', verificationToken: 'token',
  expectedRecords: [
    { type: 'TXT', name: '_mailfn.mail.example.com', value: 'mailfn-verification=token' },
    { type: 'MX', name: 'mail.example.com', value: 'route1.mx.cloudflare.net' },
  ],
  createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
} satisfies MailDomain;

describe('CloudflareDomainAdapter', () => {
  it('verifies exact DNS evidence and creates a reversible Worker routing rule', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      const value = String(url);
      requests.push({ url: value, init });
      if (value.includes('/dns_records?')) {
        const query = new URL(value).searchParams;
        const record = domain.expectedRecords.find((entry) => entry.type === query.get('type'))!;
        return Response.json({ success: true, result: [{ type: record.type, name: record.name, content: record.value }] });
      }
      if (value.endsWith('/email/routing') && init.method === 'GET') {
        return Response.json({ success: true, result: { enabled: false } });
      }
      if (value.endsWith('/email/routing/rules') && init.method === 'GET') {
        return Response.json({ success: true, result: [] });
      }
      if (value.endsWith('/email/routing/rules') && init.method === 'POST') {
        return Response.json({ success: true, result: { id: 'rule_1' } });
      }
      return Response.json({ success: true, result: {} });
    });
    const adapter = new CloudflareDomainAdapter({
      apiToken: 'secret', zoneId: 'zone_1', zoneName: 'mail.example.com', workerName: 'mailfn', fetch: fetcher,
    });

    await expect(adapter.getRequiredDnsRecords(domain.domain)).resolves.toEqual([
      { type: 'MX', name: domain.domain, value: 'route1.mx.cloudflare.net' },
      { type: 'MX', name: domain.domain, value: 'route2.mx.cloudflare.net' },
      { type: 'MX', name: domain.domain, value: 'route3.mx.cloudflare.net' },
    ]);
    await expect(adapter.verifyDns(domain)).resolves.toEqual({ verified: true, diagnostics: [] });
    await expect(adapter.createRouting(domain)).resolves.toEqual({ routingRuleId: 'rule_1' });
    await adapter.disableRouting({ ...domain, routingRuleId: 'rule_1' });

    expect(requests.every((entry) => new Headers(entry.init.headers).get('Authorization') === 'Bearer secret')).toBe(true);
    const createRule = requests.find((entry) => entry.url.endsWith('/email/routing/rules') && entry.init.method === 'POST')!;
    expect(JSON.parse(String(createRule.init.body))).toMatchObject({
      actions: [{ type: 'worker', value: ['mailfn'] }],
    });
    expect(requests.some((entry) => entry.url.endsWith('/email/routing/enable') && entry.init.method === 'POST')).toBe(true);
    expect(requests.some((entry) => entry.url.endsWith('/email/routing/dns') && entry.init.method === 'GET')).toBe(true);
    expect(requests.at(-1)).toMatchObject({
      url: 'https://api.cloudflare.com/client/v4/zones/zone_1/email/routing/rules/rule_1',
      init: { method: 'DELETE' },
    });
  });

  it('reports missing records without mutating routing', async () => {
    const fetcher = vi.fn(async () => Response.json({ success: true, result: [] }));
    const adapter = new CloudflareDomainAdapter({
      apiToken: 'secret', zoneId: 'zone_1', zoneName: 'mail.example.com', workerName: 'mailfn', fetch: fetcher,
    });
    await expect(adapter.verifyDns(domain)).resolves.toEqual({
      verified: false,
      diagnostics: ['Missing TXT _mailfn.mail.example.com', 'Missing MX mail.example.com'],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  });

  it('treats an already-missing routing rule as an idempotent teardown', async () => {
    const fetcher = vi.fn(async () => Response.json({ success: false, result: null, errors: [{ code: 1001, message: 'Email routing rule not found' }] }, { status: 404 }));
    const adapter = new CloudflareDomainAdapter({
      apiToken: 'secret', zoneId: 'zone_1', zoneName: 'mail.example.com', workerName: 'mailfn', fetch: fetcher,
    });
    await expect(adapter.disableRouting({ ...domain, status: 'disabled', routingRuleId: 'missing' })).resolves.toBeUndefined();
  });

  it('does not treat unrelated Cloudflare 404 responses as completed teardown', async () => {
    const fetcher = vi.fn(async () => Response.json({
      success: false,
      result: null,
      errors: [{ code: 7003, message: 'Could not route to the configured zone' }],
    }, { status: 404 }));
    const adapter = new CloudflareDomainAdapter({
      apiToken: 'secret', zoneId: 'stale-zone', zoneName: 'mail.example.com', workerName: 'mailfn', fetch: fetcher,
    });

    await expect(adapter.disableRouting({ ...domain, routingRuleId: 'rule-live' }))
      .rejects.toThrow('MAILFN_CLOUDFLARE_API_FAILED:7003');
  });

  it('rejects a domain that is not the exact authorized Cloudflare zone', async () => {
    const fetcher = vi.fn();
    const adapter = new CloudflareDomainAdapter({
      apiToken: 'secret', zoneId: 'zone_1', zoneName: 'example.com', workerName: 'mailfn', fetch: fetcher,
    });
    await expect(adapter.verifyDns(domain)).rejects.toThrow('MAILFN_CLOUDFLARE_ZONE_MISMATCH');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
