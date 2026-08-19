import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export type SignatureEncoding = 'hex' | 'base64';

export type WebhookSignatureOptions = {
  algorithm?: 'sha256' | 'sha1' | 'sha512';
  encoding?: SignatureEncoding;
  prefix?: string;
};

export type StandardWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export type StandardWebhookVerificationOptions = {
  toleranceSeconds?: number;
  now?: () => number;
};

export function signWebhookPayload(
  payload: string,
  secret: string,
  options: WebhookSignatureOptions = {}
): string {
  const algorithm = options.algorithm ?? 'sha256';
  const encoding = options.encoding ?? 'hex';
  const digest = createHmac(algorithm, secret).update(payload, 'utf8').digest(encoding);
  const prefix = options.prefix ?? '';
  return `${prefix}${digest}`;
}

export function verifyWebhookSignature(
  payload: string,
  providedSignature: string,
  secret: string,
  options: WebhookSignatureOptions = {}
): boolean {
  const algorithm = options.algorithm ?? 'sha256';
  const encoding = options.encoding ?? 'hex';
  const prefix = options.prefix ?? '';

  if (prefix && !providedSignature.startsWith(prefix)) {
    return false;
  }

  const providedDigest = prefix ? providedSignature.slice(prefix.length) : providedSignature;
  const expectedDigest = createHmac(algorithm, secret).update(payload, 'utf8').digest(encoding);

  const providedBuffer = decodeSignature(providedDigest, encoding);
  const expectedBuffer = decodeSignature(expectedDigest, encoding);

  if (!providedBuffer || !expectedBuffer) {
    return false;
  }

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function verifyStandardWebhookSignature(
  payload: string,
  headers: StandardWebhookHeaders,
  secret: string,
  options: StandardWebhookVerificationOptions = {}
): boolean {
  const timestamp = Number(headers.timestamp);
  const toleranceSeconds = options.toleranceSeconds ?? 300;
  const now = options.now?.() ?? Date.now();

  if (
    !/^\d+$/.test(headers.timestamp) ||
    !Number.isSafeInteger(timestamp) ||
    !Number.isFinite(now) ||
    !Number.isFinite(toleranceSeconds) ||
    toleranceSeconds < 0 ||
    Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds
  ) {
    return false;
  }

  const serializedSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const secretBuffer = decodeSignature(serializedSecret, 'base64');
  if (!secretBuffer) {
    return false;
  }

  const expected = createHmac('sha256', secretBuffer)
    .update(`${headers.id}.${headers.timestamp}.${payload}`, 'utf8')
    .digest();

  return headers.signature.split(/\s+/).some((candidate) => {
    const [version, encoded, ...remainder] = candidate.split(',');
    if (version !== 'v1' || !encoded || remainder.length > 0) {
      return false;
    }
    const provided = decodeSignature(encoded, 'base64');
    return Boolean(provided && provided.length === expected.length && timingSafeEqual(provided, expected));
  });
}

export type WebhookDeliveryInput = {
  url: string;
  payload: unknown;
  secret?: string;
  signatureHeader?: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
};

export type WebhookDeliveryAttempt = {
  attempt: number;
  ok: boolean;
  status?: number;
  error?: string;
};

export type WebhookDeliveryResult = {
  ok: boolean;
  attempts: WebhookDeliveryAttempt[];
  responseStatus?: number;
};

export type WebhookDeliveryOptions = {
  resolveHostname?: (hostname: string) => Promise<readonly string[]>;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  perAttemptTimeoutMs?: number;
};

function findHeaderKey(headers: Record<string, string>, headerName: string): string | undefined {
  const target = headerName.toLowerCase();
  const matches = Object.keys(headers).filter((key) => key.toLowerCase() === target);
  return matches.at(-1);
}

function deleteHeaderVariants(headers: Record<string, string>, headerName: string): void {
  const target = headerName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      delete headers[key];
    }
  }
}

function setCanonicalHeader(headers: Record<string, string>, headerName: string, value: string): void {
  deleteHeaderVariants(headers, headerName);
  headers[headerName] = value;
}

function normalizeNonNegativeDuration(
  value: number | undefined,
  fallback: number,
  errorCode: string
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    throw new Error(errorCode);
  }
  return Math.max(0, value);
}

async function defaultResolveHostname(hostname: string): Promise<readonly string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address }) => address);
}

function failedDelivery(error: string): WebhookDeliveryResult {
  return {
    ok: false,
    attempts: [{ attempt: 1, ok: false, error }],
  };
}

async function validateWebhookTarget(
  url: URL,
  resolveHostname: (hostname: string) => Promise<readonly string[]>
): Promise<{ error: string | null; hostname: string; addresses: readonly string[] }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return {
      error: `Webhook target hostname is not public: ${hostname}`,
      hostname,
      addresses: [],
    };
  }

  const literalVersion = isIP(hostname);
  let addresses: readonly string[];
  if (literalVersion !== 0) {
    addresses = [hostname];
  } else {
    try {
      addresses = await resolveHostname(hostname);
    } catch {
      return {
        error: `Webhook target hostname could not be resolved: ${hostname}`,
        hostname,
        addresses: [],
      };
    }
    if (addresses.length === 0) {
      return {
        error: `Webhook target hostname could not be resolved: ${hostname}`,
        hostname,
        addresses: [],
      };
    }
  }

  for (const address of addresses) {
    if (isNonPublicAddress(address)) {
      return {
        error: `Webhook target resolves to a non-public address: ${address}`,
        hostname,
        addresses,
      };
    }
  }
  return { error: null, hostname, addresses };
}

function createPinnedDispatcher(hostname: string, addresses: readonly string[]): Agent {
  let nextAddress = 0;
  const lookupPinnedAddress = ((requestedHostname, options, callback) => {
    const normalizedHostname = requestedHostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.+$/, '')
      .toLowerCase();
    if (normalizedHostname !== hostname) {
      callback(new Error(`WEBHOOK_UNVALIDATED_HOSTNAME: ${normalizedHostname}`), '', 0);
      return;
    }

    const family = typeof options === 'object' ? options.family : 0;
    const candidates = addresses.filter((address) => family === 0 || isIP(address) === family);
    if (candidates.length === 0) {
      callback(new Error(`WEBHOOK_VALIDATED_ADDRESS_FAMILY_UNAVAILABLE: ${hostname}`), '', 0);
      return;
    }

    if (typeof options === 'object' && options.all) {
      callback(
        null,
        candidates.map((address) => ({ address, family: isIP(address) }))
      );
      return;
    }

    const address = candidates[nextAddress % candidates.length]!;
    nextAddress += 1;
    callback(null, address, isIP(address));
  }) as LookupFunction;

  return new Agent({ connect: { lookup: lookupPinnedAddress } });
}

function isNonPublicAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '').split('%', 1)[0] ?? '';
  const version = isIP(normalized);
  if (version === 4) {
    return isNonPublicIpv4(normalized);
  }
  if (version === 6) {
    const bytes = parseIpv6(normalized);
    if (!bytes) {
      return true;
    }

    // Embedded-IPv4 forms must inherit the IPv4 restrictions. Cover both
    // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96) addresses.
    const first10Zero = bytes.slice(0, 10).every((byte) => byte === 0);
    if (
      first10Zero &&
      ((bytes[10] === 0xff && bytes[11] === 0xff) ||
        (bytes[10] === 0 && bytes[11] === 0))
    ) {
      return isNonPublicIpv4(bytes.slice(12).join('.'));
    }

    // NAT64's well-known 64:ff9b::/96 prefix also embeds an IPv4 destination.
    if (
      bytes[0] === 0x00 &&
      bytes[1] === 0x64 &&
      bytes[2] === 0xff &&
      bytes[3] === 0x9b &&
      bytes.slice(4, 12).every((byte) => byte === 0)
    ) {
      return isNonPublicIpv4(bytes.slice(12).join('.'));
    }

    // RFC 8215 reserves 64:ff9b:1::/48 for local-use NAT64. Its translation
    // policy is network-specific and can reach private IPv4 services, so the
    // entire local-use prefix is non-public regardless of its embedded bits.
    if (
      bytes[0] === 0x00 &&
      bytes[1] === 0x64 &&
      bytes[2] === 0xff &&
      bytes[3] === 0x9b &&
      bytes[4] === 0x00 &&
      bytes[5] === 0x01
    ) {
      return true;
    }

    const unspecified = bytes.every((byte) => byte === 0);
    const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
    const uniqueLocal = (bytes[0]! & 0xfe) === 0xfc; // fc00::/7
    const linkLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80; // fe80::/10
    const siteLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0; // fec0::/10
    const multicast = bytes[0] === 0xff; // ff00::/8
    return unspecified || loopback || uniqueLocal || linkLocal || siteLocal || multicast;
  }
  return true;
}

function isNonPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return true;
  }
  const [a, b, c] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6(address: string): number[] | null {
  let input = address.toLowerCase();
  if (input.includes('.')) {
    const separator = input.lastIndexOf(':');
    const ipv4 = input.slice(separator + 1).split('.').map(Number);
    if (
      separator < 0 ||
      ipv4.length !== 4 ||
      ipv4.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
      return null;
    }
    input = `${input.slice(0, separator)}:${((ipv4[0]! << 8) | ipv4[1]!).toString(16)}:${(
      (ipv4[2]! << 8) |
      ipv4[3]!
    ).toString(16)}`;
  }

  if ((input.match(/::/g) ?? []).length > 1) {
    return null;
  }
  const [leftText, rightText] = input.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((input.includes('::') && missing < 1) || (!input.includes('::') && missing !== 0)) {
    return null;
  }
  const parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) {
      return null;
    }
    const value = Number.parseInt(part, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

export async function deliverWebhook(
  input: WebhookDeliveryInput,
  options: WebhookDeliveryOptions = {}
): Promise<WebhookDeliveryResult> {
  const maxRetries = normalizeRetryCount(options.maxRetries);
  const initialDelayMs = normalizeNonNegativeDuration(
    options.initialDelayMs,
    1000,
    'WEBHOOK_INITIAL_DELAY_INVALID'
  );
  const maxDelayMs = Math.max(
    initialDelayMs,
    normalizeNonNegativeDuration(options.maxDelayMs, 30_000, 'WEBHOOK_MAX_DELAY_INVALID')
  );
  const perAttemptTimeoutMs = normalizeNonNegativeDuration(
    options.perAttemptTimeoutMs,
    15_000,
    'WEBHOOK_PER_ATTEMPT_TIMEOUT_INVALID'
  );

  // Only http(s) delivery targets are permitted. This blocks SSRF vectors via
  // other URL schemes (file:, gopher:, data:, ...) should the delivery URL be
  // influenced by untrusted input.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch {
    return {
      ok: false,
      attempts: [{ attempt: 1, ok: false, error: 'Webhook URL is not a valid URL' }],
    };
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      ok: false,
      attempts: [
        { attempt: 1, ok: false, error: `Webhook URL scheme not allowed: ${parsedUrl.protocol}` },
      ],
    };
  }

  let payloadString: string;
  try {
    payloadString = JSON.stringify(input.payload);
  } catch (error) {
    return {
      ok: false,
      attempts: [
        {
          attempt: 1,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  if (typeof payloadString !== 'string') {
    return {
      ok: false,
      attempts: [
        {
          attempt: 1,
          ok: false,
          error: 'Webhook payload must be JSON-serializable',
        },
      ],
    };
  }
  const headers: Record<string, string> = { ...(input.headers ?? {}) };

  const existingContentType = headers[findHeaderKey(headers, 'Content-Type') ?? ''] ?? undefined;
  const normalizedContentType =
    typeof existingContentType === 'string' && existingContentType.toLowerCase().includes('json')
      ? existingContentType
      : 'application/json';
  setCanonicalHeader(headers, 'Content-Type', normalizedContentType);

  if (input.secret !== undefined) {
    if (input.secret.length === 0) {
      throw new Error('WEBHOOK_SECRET_INVALID');
    }
    if (input.signatureHeader !== undefined && input.signatureHeader.trim().length === 0) {
      throw new Error('WEBHOOK_SIGNATURE_HEADER_INVALID');
    }
    setCanonicalHeader(
      headers,
      input.signatureHeader ?? 'X-Webhook-Signature',
      signWebhookPayload(payloadString, input.secret)
    );
  }

  const validatedTarget = await validateWebhookTarget(
    parsedUrl,
    options.resolveHostname ?? defaultResolveHostname
  );
  if (validatedTarget.error) {
    return failedDelivery(validatedTarget.error);
  }
  // Keep the TLS/HTTP hostname unchanged, but force the connection lookup to
  // use only addresses that passed the public-address checks. This closes the
  // DNS-rebinding gap between validation and the actual socket connection.
  const pinnedDispatcher = createPinnedDispatcher(
    validatedTarget.hostname,
    validatedTarget.addresses
  );

  const attempts: WebhookDeliveryAttempt[] = [];

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      if (controller && perAttemptTimeoutMs > 0) {
        timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs);
      }
      try {
        // Delivery always uses Undici so callers cannot bypass the validated,
        // pinned dispatcher with a fetch implementation that ignores it.
        const response = await undiciFetch(input.url, {
          method: input.method ?? 'POST',
          headers,
          body: payloadString,
          signal: controller?.signal,
          // Do not let an allowed public target redirect the request to an
          // unchecked internal address.
          redirect: 'manual',
          dispatcher: pinnedDispatcher,
        } as Parameters<typeof undiciFetch>[1]);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (response.body) {
          await response.body.cancel().catch(() => undefined);
        }

        if (response.ok) {
          attempts.push({
            attempt,
            ok: true,
            status: response.status,
          });

          return {
            ok: true,
            attempts,
            responseStatus: response.status,
          };
        }

        attempts.push({
          attempt,
          ok: false,
          status: response.status,
          error: `HTTP ${response.status}`,
        });

        if (attempt >= maxRetries || !shouldRetryWebhookStatus(response.status)) {
          return {
            ok: false,
            attempts,
            responseStatus: response.status,
          };
        }
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        attempts.push({
          attempt,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt >= maxRetries || !shouldRetryWebhookError(error)) {
          return {
            ok: false,
            attempts,
            responseStatus: attempts[attempts.length - 1]?.status,
          };
        }
      }

      if (attempt < maxRetries) {
        const delay = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
        await sleep(delay);
      }
    }

    return {
      ok: false,
      attempts,
      responseStatus: attempts[attempts.length - 1]?.status,
    };
  } finally {
    await pinnedDispatcher.close().catch(() => undefined);
  }
}

function normalizeRetryCount(value: number | undefined): number {
  if (value === undefined) {
    return 3;
  }
  if (!Number.isFinite(value)) {
    throw new Error('WEBHOOK_MAX_RETRIES_INVALID');
  }
  return Math.max(1, Math.trunc(value));
}

function decodeSignature(value: string, encoding: SignatureEncoding): Buffer | null {
  if (encoding === 'hex') {
    if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) {
      return null;
    }

    return Buffer.from(value, 'hex');
  }

  try {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
      return null;
    }
    const paddedValue = `${value}${'='.repeat((4 - (value.length % 4 || 4)) % 4)}`;
    const decoded = Buffer.from(paddedValue, 'base64');
    if (decoded.length === 0) {
      return null;
    }
    const canonicalPadded = decoded.toString('base64');
    const canonicalUnpadded = canonicalPadded.replace(/=+$/, '');
    return value === canonicalPadded || value === canonicalUnpadded ? decoded : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryWebhookStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function shouldRetryWebhookError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return error.name === 'AbortError' || !('status' in error);
}
