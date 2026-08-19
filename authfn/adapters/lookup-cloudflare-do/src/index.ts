import type { ConditionalKVStoreAdapter } from '@superfunctions/db';

export interface CloudflareDurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): CloudflareDurableObjectStub;
}

export interface CloudflareDurableObjectStub {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface CloudflareRegionLookupStoreOptions {
  objectNamePrefix?: string;
  path?: string;
}

export interface DurableObjectStateLike {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
  };
}

interface StoredEntry {
  value: string;
  expiresAt?: number;
}

interface LookupRequest {
  operation: 'get' | 'set' | 'setIfAbsent' | 'compareAndSet' | 'delete';
  key?: string;
  value?: string;
  expected?: string | null;
  ttlSeconds?: number;
}

interface LookupResponse<T> {
  ok: true;
  data: T;
}

interface LookupErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export class AuthFnCloudflareDoLookupStoreError extends Error {
  readonly operation: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(operation: string, message: string, options: {
    status?: number;
    retryable?: boolean;
    cause?: unknown;
  } = {}) {
    super(message, { cause: options.cause });
    this.name = 'AuthFnCloudflareDoLookupStoreError';
    this.operation = operation;
    this.status = options.status;
    this.retryable = options.retryable ?? isRetryableStatus(options.status);
  }
}

export function createCloudflareRegionLookupStore(
  namespace: CloudflareDurableObjectNamespace,
  options: CloudflareRegionLookupStoreOptions = {},
): ConditionalKVStoreAdapter {
  const path = options.path ?? '/lookup';

  async function call<T>(request: LookupRequest): Promise<T> {
    const key = requireKey(request.key);
    const objectName = await objectNameForKey(key, options.objectNamePrefix);
    const stub = namespace.get(namespace.idFromName(objectName));

    let response: Response;
    try {
      response = await stub.fetch(`https://authfn-region-lookup.local${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      throw new AuthFnCloudflareDoLookupStoreError(
        request.operation,
        `AuthFn Cloudflare DO lookup store failed during ${request.operation}`,
        { cause: error, retryable: true },
      );
    }

    const payload = await response.json().catch(() => null) as LookupResponse<T> | LookupErrorResponse | null;
    if (!response.ok || !payload || payload.ok !== true) {
      const message = payload && payload.ok === false
        ? payload.error.message
        : `AuthFn Cloudflare DO lookup store returned ${response.status}`;
      throw new AuthFnCloudflareDoLookupStoreError(request.operation, message, {
        status: response.status,
      });
    }

    return payload.data;
  }

  return {
    get(key) {
      return call<string | null>({ operation: 'get', key });
    },

    async set(input) {
      await call<null>({ operation: 'set', ...input });
    },

    setIfAbsent(input) {
      return call<{ inserted: boolean; existing?: string }>({
        operation: 'setIfAbsent',
        ...input,
      });
    },

    compareAndSet(input) {
      return call<{ updated: boolean; existing?: string }>({
        operation: 'compareAndSet',
        ...input,
      });
    },

    async delete(key) {
      await call<null>({ operation: 'delete', key });
    },
  };
}

export class AuthFnRegionLookupDurableObject {
  private readonly state: DurableObjectStateLike;

  constructor(state: DurableObjectStateLike) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return json({
        ok: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Method not allowed',
        },
      } satisfies LookupErrorResponse, 405);
    }

    let body: LookupRequest;
    try {
      body = await request.json() as LookupRequest;
    } catch {
      return json({
        ok: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Invalid JSON body',
        },
      } satisfies LookupErrorResponse, 400);
    }

    try {
      return await this.handle(body);
    } catch (error) {
      return json({
        ok: false,
        error: {
          code: 'LOOKUP_STORE_ERROR',
          message: error instanceof Error ? error.message : 'Cloudflare lookup store failed',
        },
      } satisfies LookupErrorResponse, 500);
    }
  }

  private async handle(body: LookupRequest): Promise<Response> {
    requireKey(body.key);

    switch (body.operation) {
      case 'get': {
        const existing = await this.readEntry();
        return json({ ok: true, data: existing?.value ?? null } satisfies LookupResponse<string | null>);
      }

      case 'set': {
        await this.writeEntry(requireValue(body.value), body.ttlSeconds);
        return json({ ok: true, data: null } satisfies LookupResponse<null>);
      }

      case 'setIfAbsent': {
        const existing = await this.readEntry();
        if (existing) {
          return json({
            ok: true,
            data: { inserted: false, existing: existing.value },
          } satisfies LookupResponse<{ inserted: boolean; existing?: string }>);
        }

        await this.writeEntry(requireValue(body.value), body.ttlSeconds);
        return json({ ok: true, data: { inserted: true } } satisfies LookupResponse<{ inserted: boolean }>);
      }

      case 'compareAndSet': {
        const existing = await this.readEntry();
        const existingValue = existing?.value ?? null;
        if (existingValue !== body.expected) {
          return json({
            ok: true,
            data: { updated: false, existing: existing?.value },
          } satisfies LookupResponse<{ updated: boolean; existing?: string }>);
        }

        await this.writeEntry(requireValue(body.value), body.ttlSeconds);
        return json({ ok: true, data: { updated: true } } satisfies LookupResponse<{ updated: boolean }>);
      }

      case 'delete': {
        await this.state.storage.delete('entry');
        await this.state.storage.delete('record');
        return json({ ok: true, data: null } satisfies LookupResponse<null>);
      }
    }
  }

  private async readEntry(): Promise<StoredEntry | undefined> {
    const entry = await this.state.storage.get<StoredEntry>('entry');
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      await this.state.storage.delete('entry');
      return undefined;
    }
    if (entry) return entry;

    // Older releases stored a structured lookup record under `record` in an
    // object named from the bare identifier. Expose it as the generic KV value
    // so AuthFn Core can lazily migrate it to the prefixed key/object.
    const legacy = await this.state.storage.get<Record<string, unknown>>('record');
    return legacy ? { value: JSON.stringify(legacy) } : undefined;
  }

  private async writeEntry(value: string, ttlSeconds?: number): Promise<void> {
    await this.state.storage.put<StoredEntry>('entry', {
      value,
      expiresAt: ttlSeconds === undefined ? undefined : Date.now() + (ttlSeconds * 1000),
    });
  }
}

async function objectNameForKey(key: string, prefix = ''): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}${hash}`;
}

function requireKey(key: string | undefined): string {
  if (!key) {
    throw new Error('key is required');
  }
  return key;
}

function requireValue(value: string | undefined): string {
  if (value === undefined) {
    throw new Error('value is required');
  }
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}
