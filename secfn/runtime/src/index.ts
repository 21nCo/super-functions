import type {
  RuntimeSecretResponse,
  RuntimeSecretSetResponse,
  SecFnEnvironment,
  SecFnRuntimeClientConfig,
} from "@secfn/core";

export interface SecFnRuntimeConfig extends SecFnRuntimeClientConfig {
  fetch?: typeof fetch;
}

export interface RuntimeGetOptions {
  environment?: SecFnEnvironment;
  bypassCache?: boolean;
}

export interface SecFnRuntime {
  get(key: string, options?: RuntimeGetOptions): Promise<string>;
  getSet(name: string, options?: RuntimeGetOptions): Promise<Record<string, string>>;
  preload(keysOrSetNames: string[]): Promise<void>;
  toEnv(secretSetName: string, options?: RuntimeGetOptions): Promise<Record<string, string>>;
  toDotEnv(secretSetName: string, options?: RuntimeGetOptions): Promise<string>;
  injectEnv(secretSetName: string, options?: RuntimeGetOptions & { override?: boolean }): Promise<Record<string, string>>;
  clearCache(): void;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createSecFnRuntime(config: SecFnRuntimeConfig): SecFnRuntime {
  const fetchImpl = config.fetch ?? fetch;
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const cache = new Map<string, CacheEntry<unknown>>();
  const ttlMs = config.cache?.ttlMs ?? 0;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${endpoint}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        ...(config.tenantId ? { "x-secfn-tenant": config.tenantId } : {}),
        ...(config.tenantId ? { "x-tenant-id": config.tenantId } : {}),
        ...(config.namespace ? { "x-secfn-namespace": config.namespace } : {}),
        ...(config.namespace ? { "x-namespace": config.namespace } : {}),
        ...init?.headers,
      },
    });
    const body = await response.json().catch(() => null) as
      | { ok: true; data: T }
      | { ok: false; error: { code: string; message: string } }
      | null;
    if (!response.ok || !body?.ok) {
      const message = body && "error" in body ? body.error.message : `SecFn runtime request failed (${response.status})`;
      throw new Error(message);
    }
    return body.data;
  }

  async function cached<T>(key: string, load: () => Promise<T>, bypass = false): Promise<T> {
    const hit = cache.get(key) as CacheEntry<T> | undefined;
    if (!bypass && hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await load();
    if (ttlMs > 0) {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    return value;
  }

  const runtime: SecFnRuntime = {
    async get(key, options = {}) {
      const env = options.environment ?? config.environment;
      const query = env ? `?environment=${encodeURIComponent(env)}` : "";
      const cacheKey = `secret:${key}:${env ?? ""}`;
      const data = await cached<RuntimeSecretResponse>(
        cacheKey,
        () => request<RuntimeSecretResponse>(`/runtime/secrets/${encodeURIComponent(key)}${query}`),
        options.bypassCache,
      );
      return data.value;
    },

    async getSet(name, options = {}) {
      const query = options.environment ? `?environment=${encodeURIComponent(options.environment)}` : "";
      const cacheKey = `set:${name}:${options.environment ?? ""}`;
      const data = await cached<RuntimeSecretSetResponse>(
        cacheKey,
        () => request<RuntimeSecretSetResponse>(
          `/runtime/secret-sets/${encodeURIComponent(name)}/resolve${query}`,
          { method: "POST", body: "{}" },
        ),
        options.bypassCache,
      );
      return data.secrets;
    },

    async preload(keysOrSetNames) {
      await Promise.all(keysOrSetNames.map(async (name) => {
        if (name.startsWith("set:")) {
          await runtime.getSet(name.slice("set:".length));
        } else {
          await runtime.get(name.replace(/^secret:/, ""));
        }
      }));
    },

    async toEnv(secretSetName, options) {
      return runtime.getSet(secretSetName, options);
    },

    async toDotEnv(secretSetName, options) {
      return formatDotEnv(await runtime.toEnv(secretSetName, options));
    },

    async injectEnv(secretSetName, options = {}) {
      const values = await runtime.toEnv(secretSetName, options);
      for (const [key, value] of Object.entries(values)) {
        if (options.override || process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      return values;
    },

    clearCache() {
      cache.clear();
    },
  };

  return runtime;
}

export function formatDotEnv(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${quoteDotEnvValue(value)}`)
    .join("\n");
}

function quoteDotEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
