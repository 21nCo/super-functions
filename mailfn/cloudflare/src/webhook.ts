import type { MailFnWebhookDispatcher } from '@mailfn/core';
import type { D1Database } from './bindings.js';

export interface CloudflareWebhookDispatcherOptions {
  /** Transport must connect to one of the supplied, already-vetted IP addresses. */
  fetchResolved?: (url: URL, addresses: readonly string[], init: RequestInit) => Promise<Response>;
  maxAttempts?: number;
  timeoutMs?: number;
  resolveHostname?: (hostname: string) => Promise<string[]>;
  dnsFetch?: typeof globalThis.fetch;
}

class WebhookResolutionError extends Error {
  public constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

const WEBHOOK_RESPONSE_HEADER_LIMIT = 64 * 1024;
const HTTP_HEADER_DELIMITER = '\r\n\r\n';

export function parseCloudflareWebhookResponseHead(response: string): { complete: false } | { complete: true; status: number } {
  const headerEnd = response.indexOf(HTTP_HEADER_DELIMITER);
  if (headerEnd < 0) {
    // Permit a delimiter split across reads without permitting another header byte.
    if (new TextEncoder().encode(response).byteLength > WEBHOOK_RESPONSE_HEADER_LIMIT + HTTP_HEADER_DELIMITER.length - 1) {
      throw new Error('MAILFN_WEBHOOK_RESPONSE_HEADERS_TOO_LARGE');
    }
    return { complete: false };
  }
  if (new TextEncoder().encode(response.slice(0, headerEnd)).byteLength > WEBHOOK_RESPONSE_HEADER_LIMIT) {
    throw new Error('MAILFN_WEBHOOK_RESPONSE_HEADERS_TOO_LARGE');
  }
  const status = Number(/^HTTP\/1\.[01]\s+(\d{3})/.exec(response.slice(0, headerEnd))?.[1]);
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new Error('MAILFN_WEBHOOK_RESPONSE_INVALID');
  }
  return { complete: true, status };
}

/**
 * Cloudflare Workers transport that connects to a vetted address while using
 * the original hostname for TLS verification and the HTTP Host header.
 */
export async function cloudflareFetchResolved(
  url: URL,
  addresses: readonly string[],
  init: RequestInit,
): Promise<Response> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('MAILFN_WEBHOOK_PROTOCOL_FORBIDDEN');
  if (typeof init.body !== 'string') throw new Error('MAILFN_WEBHOOK_BODY_INVALID');
  const { connect } = await import('cloudflare:sockets');
  let lastError: unknown;
  for (const address of addresses) {
    try {
      const tls = url.protocol === 'https:';
      let socket = connect(
        { hostname: address, port: Number(url.port || (tls ? 443 : 80)) },
        { allowHalfOpen: false, secureTransport: tls ? 'starttls' : 'off' },
      );
      if (tls) socket = socket.startTls({ expectedServerHostname: url.hostname });
      const abort = (): void => { void socket.close(); };
      if (init.signal?.aborted) throw new Error('MAILFN_WEBHOOK_ABORTED');
      init.signal?.addEventListener('abort', abort, { once: true });
      try {
        await socket.opened;
        const headers = new Headers(init.headers);
        headers.set('Host', url.host);
        headers.set('Content-Length', String(new TextEncoder().encode(init.body).byteLength));
        headers.set('Connection', 'close');
        const headerLines = [...headers].map(([name, value]) => `${name}: ${value}`);
        const request = `${init.method ?? 'GET'} ${url.pathname}${url.search} HTTP/1.1\r\n${headerLines.join('\r\n')}\r\n\r\n${init.body}`;
        const writer = socket.writable.getWriter();
        await writer.write(new TextEncoder().encode(request));
        writer.releaseLock();
        const reader = socket.readable.getReader();
        const decoder = new TextDecoder();
        let responseHead = '';
        let parsed: ReturnType<typeof parseCloudflareWebhookResponseHead> = { complete: false };
        while (!parsed.complete) {
          const { done, value } = await reader.read();
          if (done) break;
          responseHead += decoder.decode(value, { stream: true });
          parsed = parseCloudflareWebhookResponseHead(responseHead);
        }
        await reader.cancel();
        if (!parsed.complete) throw new Error('MAILFN_WEBHOOK_RESPONSE_INVALID');
        return new Response(null, { status: parsed.status });
      } finally {
        init.signal?.removeEventListener('abort', abort);
        await socket.close().catch(() => undefined);
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('MAILFN_WEBHOOK_CONNECT_FAILED');
}

export class CloudflareWebhookDispatcher implements MailFnWebhookDispatcher {
  private readonly fetchResolved?: CloudflareWebhookDispatcherOptions['fetchResolved'];
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly resolveHostname: (hostname: string) => Promise<string[]>;

  public constructor(options: CloudflareWebhookDispatcherOptions = {}) {
    this.fetchResolved = options.fetchResolved;
    this.maxAttempts = Math.min(8, Math.max(1, options.maxAttempts ?? 4));
    this.timeoutMs = Math.min(30_000, Math.max(250, options.timeoutMs ?? 10_000));
    const dnsFetch = options.dnsFetch ?? globalThis.fetch;
    this.resolveHostname = options.resolveHostname ?? ((hostname) => resolveWithDnsOverHttps(hostname, dnsFetch));
  }

  public async validateUrl(url: URL): Promise<void> {
    await this.resolveAddresses(url);
  }

  public async deliver(input: Parameters<MailFnWebhookDispatcher['deliver']>[0]): Promise<{ ok: boolean; status?: number; retryable: boolean }> {
    const secret = input.webhook.secretCiphertext;
    if (!secret || !this.fetchResolved) return { ok: false, retryable: false };
    const url = new URL(input.webhook.url);
    let addresses: string[];
    try {
      addresses = await this.resolveAddresses(url);
    } catch (error) {
      return { ok: false, retryable: error instanceof WebhookResolutionError ? error.retryable : true };
    }
    const body = JSON.stringify(input.event);
    const signature = await sign(`${input.timestamp}.${input.deliveryId}.${body}`, secret);
    let status: number | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchResolved(url, addresses, {
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

  private async resolveAddresses(url: URL): Promise<string[]> {
    let addresses: string[];
    try {
      addresses = await this.resolveHostname(url.hostname);
    } catch (cause) {
      throw new WebhookResolutionError(
        cause instanceof Error ? cause.message : 'Webhook hostname could not be resolved',
        true,
      );
    }
    if (!addresses.length) throw new WebhookResolutionError('Webhook hostname did not resolve to an address', true);
    if (addresses.some((address) => !isPublicIpAddress(address))) {
      throw new WebhookResolutionError('Webhook host must resolve only to public IP addresses', false);
    }
    if (addresses.some(isCloudflareIpAddress)) {
      throw new WebhookResolutionError(
        'Cloudflare-proxied webhook hosts are unsupported by the Cloudflare Workers pinned transport',
        false,
      );
    }
    return addresses;
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

const NON_PUBLIC_IPV4_CIDRS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.2', 32], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const;

const CLOUDFLARE_IPV4_CIDRS = [
  ['173.245.48.0', 20], ['103.21.244.0', 22], ['103.22.200.0', 22], ['103.31.4.0', 22],
  ['141.101.64.0', 18], ['108.162.192.0', 18], ['190.93.240.0', 20], ['188.114.96.0', 20],
  ['197.234.240.0', 22], ['198.41.128.0', 17], ['162.158.0.0', 15], ['104.16.0.0', 13],
  ['104.24.0.0', 14], ['172.64.0.0', 13], ['131.0.72.0', 22],
] as const;

const CLOUDFLARE_IPV6_CIDRS = [
  ['2400:cb00::', 32], ['2606:4700::', 32], ['2803:f800::', 32], ['2405:b500::', 32],
  ['2405:8100::', 32], ['2a06:98c0::', 29], ['2c0f:f248::', 32],
] as const;

function parseIpv4(value: string): bigint | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return undefined;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return undefined;
  return parts.reduce((result, part) => (result << 8n) | BigInt(part), 0n);
}

function parseIpv6(value: string): bigint | undefined {
  if (!value.includes(':') || value.includes('%') || value.includes('[') || value.includes(']')) return undefined;
  let normalized = value.toLowerCase();
  const ipv4Suffix = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (ipv4Suffix) {
    const ipv4 = parseIpv4(ipv4Suffix[1]!);
    if (ipv4 === undefined) return undefined;
    normalized = `${normalized.slice(0, ipv4Suffix.index)}:${((ipv4 >> 16n) & 0xffffn).toString(16)}:${(ipv4 & 0xffffn).toString(16)}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (left.some((part) => !/^[0-9a-f]{1,4}$/.test(part)) || right.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return undefined;
  if ((halves.length === 1 && left.length !== 8) || (halves.length === 2 && left.length + right.length >= 8)) return undefined;
  const groups = halves.length === 2
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return groups.reduce((result, part) => (result << 16n) | BigInt(`0x${part}`), 0n);
}

function inCidr(address: bigint, network: bigint, prefix: number, bits: number): boolean {
  const shift = BigInt(bits - prefix);
  return address >> shift === network >> shift;
}

function inIpv4Cidrs(address: bigint, cidrs: readonly (readonly [string, number])[]): boolean {
  return cidrs.some(([network, prefix]) => inCidr(address, parseIpv4(network)!, prefix, 32));
}

function inIpv6Cidrs(address: bigint, cidrs: readonly (readonly [string, number])[]): boolean {
  return cidrs.some(([network, prefix]) => inCidr(address, parseIpv6(network)!, prefix, 128));
}

function isPublicIpAddress(value: string): boolean {
  const ipv4 = parseIpv4(value);
  if (ipv4 !== undefined) return !inIpv4Cidrs(ipv4, NON_PUBLIC_IPV4_CIDRS);
  const ipv6 = parseIpv6(value);
  if (ipv6 === undefined || !inCidr(ipv6, parseIpv6('2000::')!, 3, 128)) return false;
  return !inIpv6Cidrs(ipv6, [['2001::', 23], ['2001:db8::', 32], ['3fff::', 20]]);
}

function isCloudflareIpAddress(value: string): boolean {
  const ipv4 = parseIpv4(value);
  if (ipv4 !== undefined) return inIpv4Cidrs(ipv4, CLOUDFLARE_IPV4_CIDRS);
  const ipv6 = parseIpv6(value);
  return ipv6 !== undefined && inIpv6Cidrs(ipv6, CLOUDFLARE_IPV6_CIDRS);
}
