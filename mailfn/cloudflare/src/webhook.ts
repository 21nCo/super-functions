import type { MailFnWebhookDispatcher } from '@mailfn/core';
import type { D1Database } from './bindings.js';

export interface CloudflareWebhookDispatcherOptions {
  fetch?: typeof globalThis.fetch;
  maxAttempts?: number;
  timeoutMs?: number;
  resolveHostname?: (hostname: string) => Promise<string[]>;
  dnsFetch?: typeof globalThis.fetch;
}

export class CloudflareWebhookDispatcher implements MailFnWebhookDispatcher {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly resolveHostname: (hostname: string) => Promise<string[]>;

  public constructor(options: CloudflareWebhookDispatcherOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.maxAttempts = Math.min(8, Math.max(1, options.maxAttempts ?? 4));
    this.timeoutMs = Math.min(30_000, Math.max(250, options.timeoutMs ?? 10_000));
    const dnsFetch = options.dnsFetch ?? globalThis.fetch;
    this.resolveHostname = options.resolveHostname ?? ((hostname) => resolveWithDnsOverHttps(hostname, dnsFetch));
  }

  public async deliver(input: Parameters<MailFnWebhookDispatcher['deliver']>[0]): Promise<{ ok: boolean; status?: number; retryable: boolean }> {
    const secret = input.webhook.secretCiphertext;
    if (!secret) return { ok: false, retryable: false };
    const url = new URL(input.webhook.url);
    try {
      const addresses = await this.resolveHostname(url.hostname);
      if (!addresses.length || addresses.some((address) => !isPublicIpAddress(address))) {
        return { ok: false, retryable: false };
      }
    } catch {
      return { ok: false, retryable: true };
    }
    const body = JSON.stringify(input.event);
    const signature = await sign(`${input.timestamp}.${input.deliveryId}.${body}`, secret);
    let status: number | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(input.webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MailFn-Delivery': input.deliveryId,
            'MailFn-Timestamp': input.timestamp,
            'MailFn-Signature': `v1=${signature}`,
            'User-Agent': 'MailFn-Webhook/1.0',
          },
          body,
          signal: controller.signal,
          redirect: 'manual',
        });
        status = response.status;
        if (response.ok) return { ok: true, status, retryable: false };
        if (status !== 408 && status !== 429 && status < 500) return { ok: false, status, retryable: false };
      } catch {
        status = undefined;
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < this.maxAttempts) await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 250 * 2 ** (attempt - 1))));
    }
    return { ok: false, status, retryable: true };
  }
}

async function sign(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyMailFnWebhook(input: {
  body: string;
  secret: string;
  deliveryId: string;
  timestamp: string;
  signature: string;
  now?: Date;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const age = Math.abs((input.now ?? new Date()).getTime() - Date.parse(input.timestamp));
  if (!Number.isFinite(age) || age > (input.toleranceSeconds ?? 300) * 1000) return false;
  const expected = `v1=${await sign(`${input.timestamp}.${input.deliveryId}.${input.body}`, input.secret)}`;
  if (expected.length !== input.signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ input.signature.charCodeAt(index);
  return difference === 0;
}

export interface WebhookReplayStore {
  consume(deliveryId: string, expiresAt: string): Promise<boolean>;
}

export class MemoryWebhookReplayStore implements WebhookReplayStore {
  private readonly deliveries = new Map<string, string>();

  public async consume(deliveryId: string, expiresAt: string): Promise<boolean> {
    const now = new Date().toISOString();
    for (const [id, expiry] of this.deliveries) if (expiry <= now) this.deliveries.delete(id);
    if (this.deliveries.has(deliveryId)) return false;
    this.deliveries.set(deliveryId, expiresAt);
    return true;
  }
}

export class D1WebhookReplayStore implements WebhookReplayStore {
  public constructor(private readonly database: D1Database) {}

  public async consume(deliveryId: string, expiresAt: string): Promise<boolean> {
    await this.database.prepare('DELETE FROM mailfn_webhook_replays WHERE expires_at <= ?').bind(new Date().toISOString()).run();
    const result = await this.database
      .prepare('INSERT OR IGNORE INTO mailfn_webhook_replays(delivery_id, expires_at, created_at) VALUES (?, ?, ?)')
      .bind(deliveryId, expiresAt, new Date().toISOString())
      .run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
}

export async function verifyMailFnWebhookOnce(input: Parameters<typeof verifyMailFnWebhook>[0] & {
  replayStore: WebhookReplayStore;
}): Promise<boolean> {
  if (!await verifyMailFnWebhook(input)) return false;
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  const expiresAt = new Date(Date.parse(input.timestamp) + toleranceSeconds * 1000).toISOString();
  return input.replayStore.consume(input.deliveryId, expiresAt);
}

async function resolveWithDnsOverHttps(hostname: string, fetcher: typeof globalThis.fetch): Promise<string[]> {
  const addresses: string[] = [];
  for (const type of ['A', 'AAAA']) {
    const url = new URL('https://cloudflare-dns.com/dns-query');
    url.searchParams.set('name', hostname);
    url.searchParams.set('type', type);
    const response = await fetcher(url, { headers: { Accept: 'application/dns-json' }, redirect: 'error' });
    if (!response.ok) throw new Error(`MAILFN_DNS_LOOKUP_FAILED:${response.status}`);
    const body = await response.json() as { Answer?: Array<{ type: number; data: string }> };
    for (const answer of body.Answer ?? []) {
      if ((answer.type === 1 || answer.type === 28) && !addresses.includes(answer.data)) addresses.push(answer.data);
    }
  }
  return addresses;
}

function isPublicIpAddress(value: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b, c] = parts;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113)
    );
  }
  const normalized = value.toLowerCase();
  if (!normalized.includes(':') || normalized === '::' || normalized === '::1') return false;
  return !/^(?:fc|fd|fe8|fe9|fea|feb)/.test(normalized) && !normalized.startsWith('::ffff:');
}
