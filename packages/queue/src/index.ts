export interface QueueAdapter<TPayload> {
  enqueue(queueName: string, payload: TPayload): Promise<void>;
  dequeue(queueName: string): Promise<TPayload | null>;
  dequeueMatching(queueName: string, matcher: (payload: TPayload) => boolean): Promise<TPayload | null>;
  peek(queueName: string): TPayload[];
  size(queueName: string): number;
}

function normalizeQueueName(queueName: string): string {
  const normalized = queueName.trim();
  if (!normalized || normalized.includes('/') || normalized.includes('\\') || normalized.includes('..')) {
    throw new Error('FLOWFN_QUEUE_NAME_INVALID');
  }
  return normalized;
}

export class MemoryQueueAdapter<TPayload> implements QueueAdapter<TPayload> {
  private readonly queues = new Map<string, TPayload[]>();

  async enqueue(queueName: string, payload: TPayload): Promise<void> {
    const normalizedQueueName = normalizeQueueName(queueName);
    const queue = this.queues.get(normalizedQueueName) ?? [];
    queue.push(payload);
    this.queues.set(normalizedQueueName, queue);
  }

  async dequeue(queueName: string): Promise<TPayload | null> {
    const normalizedQueueName = normalizeQueueName(queueName);
    const queue = this.queues.get(normalizedQueueName);
    if (!queue || queue.length === 0) {
      return null;
    }

    return queue.shift() as TPayload;
  }

  async dequeueMatching(queueName: string, matcher: (payload: TPayload) => boolean): Promise<TPayload | null> {
    const normalizedQueueName = normalizeQueueName(queueName);
    const queue = this.queues.get(normalizedQueueName);
    if (!queue || queue.length === 0) {
      return null;
    }

    const index = queue.findIndex(matcher);
    if (index === -1) {
      return null;
    }

    const [payload] = queue.splice(index, 1);
    return payload as TPayload;
  }

  peek(queueName: string): TPayload[] {
    const normalizedQueueName = normalizeQueueName(queueName);
    return [...(this.queues.get(normalizedQueueName) ?? [])];
  }

  size(queueName: string): number {
    const normalizedQueueName = normalizeQueueName(queueName);
    return this.queues.get(normalizedQueueName)?.length ?? 0;
  }
}

export interface FlowFnQueueAdapterConfig {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  let normalized = baseUrl;
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function encodeQueueName(queueName: string): string {
  return encodeURIComponent(normalizeQueueName(queueName));
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (value === undefined) {
    return 15_000;
  }
  if (!Number.isFinite(value)) {
    throw new Error('FLOWFN_QUEUE_TIMEOUT_INVALID');
  }
  return Math.max(0, value);
}

export class FlowFnQueueAdapter<TPayload> implements QueueAdapter<TPayload> {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(private readonly config: FlowFnQueueAdapterConfig) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = normalizeTimeoutMs(config.timeoutMs);
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  async enqueue(queueName: string, payload: TPayload): Promise<void> {
    const encodedQueueName = encodeQueueName(queueName);
    const response = await this.fetchWithTimeout(`${this.baseUrl}/queues/${encodedQueueName}/enqueue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`FlowFn enqueue failed: ${response.status} ${response.statusText}`);
    }
  }

  async dequeue(queueName: string): Promise<TPayload | null> {
    const encodedQueueName = encodeQueueName(queueName);
    const response = await this.fetchWithTimeout(`${this.baseUrl}/queues/${encodedQueueName}/dequeue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`FlowFn dequeue failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { payload?: TPayload };
    return 'payload' in data ? (data.payload as TPayload) : null;
  }

  async dequeueMatching(queueName: string, matcher: (payload: TPayload) => boolean): Promise<TPayload | null> {
    void matcher;
    encodeQueueName(queueName);
    throw new Error('FLOWFN_QUEUE_MATCHING_UNSUPPORTED');
  }

  peek(queueName: string): TPayload[] {
    encodeQueueName(queueName);
    throw new Error('FLOWFN_QUEUE_PEEK_UNSUPPORTED');
  }

  size(queueName: string): number {
    encodeQueueName(queueName);
    throw new Error('FLOWFN_QUEUE_SIZE_UNSUPPORTED');
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timeoutId =
      controller && this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;

    try {
      return await this.fetcher(url, {
        ...init,
        signal: controller?.signal,
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
