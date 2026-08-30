import type { DomainDnsRecord, MailDomain, MailFnDomainAdapter } from '@mailfn/core';

export interface CloudflareDomainAdapterConfig {
  apiToken: string;
  zoneId: string;
  /** Exact Cloudflare zone name authorized for this adapter. */
  zoneName: string;
  workerName: string;
  fetch?: typeof globalThis.fetch;
}

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
}

export class CloudflareDomainAdapter implements MailFnDomainAdapter {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly config: CloudflareDomainAdapterConfig) {
    this.fetcher = config.fetch ?? globalThis.fetch;
  }

  public async getRequiredDnsRecords(domain: string): Promise<DomainDnsRecord[]> {
    this.assertDomain(domain);
    return [
      { type: 'MX', name: domain, value: 'route1.mx.cloudflare.net' },
      { type: 'MX', name: domain, value: 'route2.mx.cloudflare.net' },
      { type: 'MX', name: domain, value: 'route3.mx.cloudflare.net' },
    ];
  }

  public async createRouting(domain: MailDomain): Promise<{ routingRuleId: string }> {
    this.assertZone(domain);
    await this.ensureEmailRouting();
    const name = `MailFn ${domain.domain}`;
    const existing = await this.call<Array<{
      id: string;
      name?: string;
      enabled?: boolean;
      matchers?: Array<{ type?: string; field?: string }>;
      actions?: Array<{ type?: string; value?: string[] }>;
    }>>(
      `/zones/${this.config.zoneId}/email/routing/rules`,
      { method: 'GET' },
    );
    const existingRule = existing.find((rule) => rule.name === name);
    if (existingRule) {
      const owned = existingRule.enabled !== false &&
        existingRule.matchers?.some((matcher) => matcher.type === 'all' && matcher.field === 'to') &&
        existingRule.actions?.some((action) => action.type === 'worker' && action.value?.includes(this.config.workerName));
      if (!owned) throw new Error(`MAILFN_CLOUDFLARE_RULE_CONFLICT:${existingRule.id}`);
      return { routingRuleId: existingRule.id };
    }
    const response = await this.call<{ id: string }>(`/zones/${this.config.zoneId}/email/routing/rules`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        enabled: true,
        priority: 0,
        matchers: [{ type: 'all', field: 'to' }],
        actions: [{ type: 'worker', value: [this.config.workerName] }],
      }),
    });
    return { routingRuleId: response.id };
  }

  public async verifyDns(domain: MailDomain): Promise<{ verified: boolean; diagnostics: string[] }> {
    this.assertZone(domain);
    await this.call(`/zones/${this.config.zoneId}/email/routing/dns`, { method: 'GET' });
    const diagnostics: string[] = [];
    for (const expected of domain.expectedRecords) {
      const query = new URLSearchParams({ type: expected.type, name: expected.name });
      const records = await this.call<Array<{ type: string; name: string; content: string; priority?: number }>>(
        `/zones/${this.config.zoneId}/dns_records?${query}`,
        { method: 'GET' },
      );
      const match = records.some(
        (record) =>
          record.type === expected.type &&
          record.name.replace(/\.$/, '') === expected.name.replace(/\.$/, '') &&
          record.content.replace(/\.$/, '') === expected.value.replace(/\.$/, '') &&
          (expected.priority === undefined || record.priority === expected.priority),
      );
      if (!match) diagnostics.push(`Missing ${expected.type} ${expected.name}`);
    }
    return { verified: diagnostics.length === 0, diagnostics };
  }

  public async disableRouting(domain: MailDomain): Promise<void> {
    this.assertZone(domain);
    if (!domain.routingRuleId) return;
    await this.call(`/zones/${this.config.zoneId}/email/routing/rules/${domain.routingRuleId}`, { method: 'DELETE' }, true);
  }

  private assertZone(domain: MailDomain): void {
    this.assertDomain(domain.domain);
  }

  private assertDomain(domain: string): void {
    const zoneName = this.config.zoneName.trim().toLowerCase().replace(/\.$/, '');
    if (domain !== zoneName) {
      throw new Error(`MAILFN_CLOUDFLARE_ZONE_MISMATCH:${domain}`);
    }
  }

  private async ensureEmailRouting(): Promise<void> {
    const status = await this.call<{ enabled?: boolean; status?: string }>(
      `/zones/${this.config.zoneId}/email/routing`,
      { method: 'GET' },
    );
    if (status.enabled || status.status === 'enabled' || status.status === 'ready') return;
    await this.call(`/zones/${this.config.zoneId}/email/routing/enable`, { method: 'POST' });
  }

  private async call<T = unknown>(path: string, init: RequestInit, ignoreNotFound = false): Promise<T> {
    const response = await this.fetcher(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    const body = (await response.json()) as CloudflareResponse<T>;
    if (
      ignoreNotFound && response.status === 404 &&
      body.errors?.some((error) => error.code === 1001 && /(?:routing\s+)?rule.*not found|not found.*(?:routing\s+)?rule/i.test(error.message))
    ) return undefined as T;
    if (!response.ok || !body.success) {
      throw new Error(`MAILFN_CLOUDFLARE_API_FAILED:${body.errors?.map((error) => error.code).join(',') ?? response.status}`);
    }
    return body.result;
  }
}
