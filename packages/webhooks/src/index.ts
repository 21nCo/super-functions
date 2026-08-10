import { createHmac, timingSafeEqual } from 'node:crypto';

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
  fetch?: typeof globalThis.fetch;
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

export async function deliverWebhook(
  input: WebhookDeliveryInput,
  options: WebhookDeliveryOptions = {}
): Promise<WebhookDeliveryResult> {
  const fetchFn = options.fetch ?? globalThis.fetch;
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

  const attempts: WebhookDeliveryAttempt[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    if (controller && perAttemptTimeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs);
    }
    try {
      const response = await fetchFn(input.url, {
        method: input.method ?? 'POST',
        headers,
        body: payloadString,
        signal: controller?.signal,
      });
      if (timeoutId) {
        clearTimeout(timeoutId);
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
