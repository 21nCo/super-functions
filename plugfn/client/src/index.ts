export type {
  PlugFnCheckpoint,
  PlugFnConnectionOwner,
  PlugFnApiEnvelope,
  PlugFnApiError,
  PlugFnConnectionSummary,
  PlugFnCreateSyncJobInput,
  PlugFnDisconnectInput,
  PlugFnOwnerKind,
  PlugFnProviderSummary,
  PlugFnStartConnectionInput,
  PlugFnSyncJob,
  PlugFnUpsertCheckpointInput,
} from './types.js';

import type {
  PlugFnApiEnvelope,
  PlugFnApiError,
  PlugFnCheckpoint,
  PlugFnConnectionSummary,
  PlugFnCreateSyncJobInput,
  PlugFnDisconnectInput,
  PlugFnProviderSummary,
  PlugFnStartConnectionInput,
  PlugFnSyncJob,
  PlugFnUpsertCheckpointInput,
} from './types.js';

export interface PlugFnClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

export interface PlugFnClient {
  listProviders(): Promise<PlugFnProviderSummary[]>;
  listConnections(options?: { provider?: string }): Promise<PlugFnConnectionSummary[]>;
  getConnection(connectionId: string): Promise<PlugFnConnectionSummary>;
  getConnectionStatus(connectionId: string): Promise<PlugFnConnectionSummary['status']>;
  startConnection(input: PlugFnStartConnectionInput): Promise<{ authUrl: string }>;
  disconnect(input: PlugFnDisconnectInput): Promise<void>;
  createSyncJob(input: PlugFnCreateSyncJobInput): Promise<PlugFnSyncJob>;
  listSyncJobs(filters?: {
    provider?: string;
    connectionId?: string;
    status?: PlugFnSyncJob['status'];
  }): Promise<PlugFnSyncJob[]>;
  getSyncJob(jobId: string): Promise<PlugFnSyncJob>;
  cancelSyncJob(jobId: string): Promise<PlugFnSyncJob>;
  upsertCheckpoint(input: PlugFnUpsertCheckpointInput): Promise<PlugFnCheckpoint>;
}

export class PlugFnClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(error: PlugFnApiError) {
    super(error.message);
    this.name = 'PlugFnClientError';
    this.code = error.code;
    this.status = error.status;
    this.retryable = error.retryable ?? false;
    this.details = error.details ?? {};
  }
}

export function resolveDefaultRedirectUri(baseUrl: string, provider: string): string {
  const root = trimTrailingSlash(baseUrl);
  const suffix = `/callback/${encodeURIComponent(provider)}`;

  try {
    const parsed = new URL(root);
    return `${trimTrailingSlash(`${parsed.origin}${parsed.pathname}`)}${suffix}`;
  } catch {
    const origin = globalThis.location?.origin;
    const path = root.startsWith('/') ? root : `/${root}`;
    if (origin) {
      return `${origin}${path}${suffix}`;
    }
    return `${path}${suffix}`;
  }
}

export function createPlugFnClient(options: PlugFnClientOptions = {}): PlugFnClient {
  const transport = new PlugFnHttpClient(options);

  return {
    async listProviders() {
      const response = await transport.get<{ providers: PlugFnProviderSummary[] }>('/providers');
      return response.providers;
    },

    async listConnections(options = {}) {
      const query = new URLSearchParams();
      if (options.provider) {
        query.set('provider', options.provider);
      }
      const response = await transport.get<{ connections: PlugFnConnectionSummary[] }>(
        withQuery('/connections', query)
      );
      return response.connections;
    },

    async getConnection(connectionId) {
      const response = await transport.get<{ connection: PlugFnConnectionSummary }>(
        `/connections/${encodeURIComponent(connectionId)}`
      );
      return response.connection;
    },

    async getConnectionStatus(connectionId) {
      const response = await transport.get<{ connection: PlugFnConnectionSummary }>(
        `/connections/${encodeURIComponent(connectionId)}/status`
      );
      const connection = response.connection;
      return connection.status;
    },

    async startConnection(input) {
      const redirectUri =
        input.redirectUri ?? resolveDefaultRedirectUri(transport.getBaseUrl(), input.provider);
      const response = await transport.post<{ authUrl: string }>('/connections/start', {
        ...input,
        redirectUri,
      });

      if (input.redirect === 'current-window') {
        globalThis.location?.assign(response.authUrl);
      } else if (input.redirect === 'new-window') {
        globalThis.open?.(response.authUrl, '_blank', 'noopener,noreferrer');
      }

      return response;
    },

    async disconnect(input) {
      await transport.post('/connections/disconnect', input);
    },

    async createSyncJob(input) {
      const response = await transport.post<{ job: PlugFnSyncJob }>('/sync/jobs', {
        ...input,
        mode: input.mode ?? 'full',
      });
      return response.job;
    },

    async listSyncJobs(filters = {}) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) {
          query.set(key, value);
        }
      }
      const response = await transport.get<{ jobs: PlugFnSyncJob[] }>(
        withQuery('/sync/jobs', query)
      );
      return response.jobs;
    },

    async getSyncJob(jobId) {
      const response = await transport.get<{ job: PlugFnSyncJob }>(
        `/sync/jobs/${encodeURIComponent(jobId)}`
      );
      return response.job;
    },

    async cancelSyncJob(jobId) {
      const response = await transport.post<{ job: PlugFnSyncJob }>(
        `/sync/jobs/${encodeURIComponent(jobId)}/cancel`,
        {}
      );
      return response.job;
    },

    async upsertCheckpoint(input) {
      const response = await transport.post<{ checkpoint: PlugFnCheckpoint }>(
        '/sync/checkpoints',
        input
      );
      return response.checkpoint;
    },
  };
}

class PlugFnHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly credentials: RequestCredentials;
  private readonly headers: PlugFnClientOptions['headers'];

  constructor(options: PlugFnClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? '/api/plugfn');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.credentials = options.credentials ?? 'include';
    this.headers = options.headers;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(await resolveHeaders(this.headers));
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      credentials: this.credentials,
      headers,
    });
    const envelope = await parseEnvelope(response);
    if (!envelope.ok) {
      throw new PlugFnClientError(envelope.error);
    }
    return envelope.data as T;
  }
}

async function parseEnvelope(response: Response): Promise<PlugFnApiEnvelope> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (isEnvelope(body)) {
    return body;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: 'PLUGFN_HTTP_ERROR',
        message: response.statusText || 'PlugFn request failed',
        status: response.status,
        retryable: response.status >= 500,
        details: {},
      },
    };
  }

  return {
    ok: true,
    data: body,
  };
}

function isEnvelope(value: unknown): value is PlugFnApiEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof (value as { ok: unknown }).ok === 'boolean'
  );
}

async function resolveHeaders(
  headers: PlugFnClientOptions['headers']
): Promise<HeadersInit | undefined> {
  if (typeof headers === 'function') {
    return headers();
  }
  return headers;
}

function withQuery(path: string, query: URLSearchParams): string {
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
