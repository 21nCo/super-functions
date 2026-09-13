export interface TransportClientConfig {
  baseUrl: string;
  headers?: HeadersInit;
  timeout?: number;
  fetchImpl?: typeof fetch;
}

export interface TransportClient {
  request(path: string, init?: RequestInit): Promise<Response>;
}

const clients = new Map<string, TransportClient>();
const fetchIds = new WeakMap<object, number>();
let nextFetchId = 1;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeHeaders(headers?: HeadersInit): [string, string][] {
  if (!headers) return [];
  if (headers instanceof Headers) {
    return Array.from(headers.entries()).sort(([left], [right]) => left.localeCompare(right));
  }
  if (Array.isArray(headers)) {
    return [...headers].sort(([left], [right]) => left.localeCompare(right));
  }
  return Object.entries(headers).sort(([left], [right]) => left.localeCompare(right));
}

function getFetchId(fetchImpl?: typeof fetch): string {
  if (!fetchImpl) return "global";
  const candidate = fetchImpl as object;
  const existing = fetchIds.get(candidate);
  if (existing) return String(existing);
  const created = nextFetchId++;
  fetchIds.set(candidate, created);
  return String(created);
}

function mergeHeaders(left?: HeadersInit, right?: HeadersInit): Headers {
  const merged = new Headers(left);
  if (right) {
    new Headers(right).forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

export function getTransportClient(config: TransportClientConfig): TransportClient {
  const key = JSON.stringify({
    baseUrl: normalizeBaseUrl(config.baseUrl),
    headers: normalizeHeaders(config.headers),
    timeout: config.timeout ?? 60_000,
    fetchId: getFetchId(config.fetchImpl)
  });
  const cached = clients.get(key);
  if (cached) {
    return cached;
  }

  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const timeout = config.timeout ?? 60_000;
  if (!fetchImpl) {
    throw new Error("fetch is not available in this runtime");
  }

  const client: TransportClient = {
    async request(path, init = {}) {
      const controller = new AbortController();
      const abort = () => controller.abort(init.signal?.reason);
      init.signal?.addEventListener("abort", abort, { once: true });
      if (init.signal?.aborted) abort();
      const timer = timeout > 0 ? setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeout) : undefined;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        init.signal?.removeEventListener("abort", abort);
      };
      try {
        controller.signal.throwIfAborted();
        const response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
          ...init,
          signal: controller.signal,
          headers: mergeHeaders(config.headers, init.headers)
        });
        controller.signal.throwIfAborted();
        if (!response.body) { cleanup(); return response; }
        const reader = response.body.getReader();
        let finished = false;
        let onAbort: () => void;
        const finish = () => {
          if (finished) return;
          finished = true;
          controller.signal.removeEventListener("abort", onAbort);
          cleanup();
        };
        const body = new ReadableStream<Uint8Array>({
          start(stream) {
            onAbort = () => {
              if (finished) return;
              finish();
              stream.error(controller.signal.reason);
              void reader.cancel(controller.signal.reason).catch(() => {});
            };
            controller.signal.addEventListener("abort", onAbort, { once: true });
          },
          async pull(stream) {
            try {
              const chunk = await reader.read();
              if (finished) return;
              if (chunk.done) { finish(); stream.close(); }
              else stream.enqueue(chunk.value);
            } catch (error) {
              if (!finished) { finish(); stream.error(error); }
            }
          },
          async cancel(reason) { finish(); await reader.cancel(reason); }
        });
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch (error) {
        cleanup();
        throw error;
      }
    }
  };

  clients.set(key, client);
  return client;
}
