import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { plugFn } from '../src/index.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { mockProvider, mockResponse, mockConnection } from '../src/testing/index.js';
import { RateLimiter } from '../src/middleware/rate-limiter.js';
import { FetchHttpClient } from '../src/utils/request.js';

describe('PlugFn SDK', () => {
  let plug: any;
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();

    plug = plugFn({
      database: adapter,
      auth: {
        async getUserId() {
          return 'test-user';
        },
        async requireAuth() {
          return 'test-user';
        },
      },
      baseUrl: 'https://test.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {
        test: {
          type: 'api-key',
          apiKey: 'test-api-key',
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provider Management', () => {
    it('should register a provider', () => {
      const provider = mockProvider('test', {
        'test.action': mockResponse({ success: true }),
      });

      plug.providers.register(provider);

      const registered = plug.providers.get('test');
      expect(registered).toBeDefined();
      expect(registered.name).toBe('test');
    });

    it('should list all providers', () => {
      const provider = mockProvider('test', {
        'test.action': mockResponse({ success: true }),
      });

      plug.providers.register(provider);

      const providers = plug.providers.list();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p: any) => p.name === 'test')).toBe(true);
    });
  });

  describe('Authentication normalization', () => {
    it('rejects a malformed auth session without dereferencing a null subject', async () => {
      const malformed = plugFn({
        database: new MemoryAdapter(),
        auth: {
          async authenticate() {
            return { subject: null } as any;
          },
        },
        baseUrl: 'https://test.com',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        integrations: {},
      });

      await expect(
        malformed.config.auth.authenticate(new Request('https://test.com/connections'))
      ).resolves.toBeNull();
    });
  });

  describe('Action Execution', () => {
    it('applies global quotas and can disable provider quotas independently', async () => {
      const acquire = vi.spyOn(RateLimiter.prototype, 'acquire').mockResolvedValue(undefined);
      const acquireMany = vi
        .spyOn(RateLimiter.prototype, 'acquireMany')
        .mockResolvedValue(undefined);
      const configuredAdapter = new MemoryAdapter();
      const configuredPlug = plugFn({
        database: configuredAdapter,
        auth: { async authenticate() { return { userId: 'test-user' }; } },
        baseUrl: 'https://test.com',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        integrations: { test: { type: 'api-key', apiKey: 'key' } },
        rateLimit: {
          enabled: true,
          respectProviderLimits: false,
          global: { requests: 25, window: 1000 },
        },
      });
      const provider = mockProvider('test', { getData: mockResponse({ ok: true }) });
      const get = vi.spyOn(FetchHttpClient.prototype, 'get').mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      provider.actions.getData.execute = async (_params, context) => {
        await context.http.get('/quota-test');
        return { ok: true };
      };
      provider.rateLimit = { requests: 1, window: 60_000 };
      configuredPlug.providers.register(provider);
      await configuredAdapter.createConnection(mockConnection('test-user', 'test'));

      await configuredPlug.test.getData({ userId: 'test-user', params: {} });

      expect(acquire).toHaveBeenCalledWith('global', { requests: 25, window: 1000 });
      expect(acquireMany).not.toHaveBeenCalled();
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('charges quota for every outbound request, including retry attempts', async () => {
      const acquireMany = vi
        .spyOn(RateLimiter.prototype, 'acquireMany')
        .mockResolvedValue(undefined);
      const get = vi
        .spyOn(FetchHttpClient.prototype, 'get')
        .mockRejectedValueOnce(Object.assign(new Error('temporary'), { status: 500 }))
        .mockResolvedValue({ data: { ok: true }, status: 200, statusText: 'OK', headers: {} });
      const provider = mockProvider('test', { getData: mockResponse({ ok: true }) });
      provider.rateLimit = { requests: 10, window: 60_000 };
      provider.actions.getData.execute = async (_params, context) => {
        await context.http.get('/quota-test');
        return { ok: true };
      };
      plug.providers.register(provider);
      await adapter.createConnection(mockConnection('test-user', 'test'));

      const result = await plug.test.getData({
        userId: 'test-user',
        params: {},
        retry: { maxAttempts: 2, delay: 0 },
      });

      expect(result).toEqual({ ok: true });
      expect(get).toHaveBeenCalledTimes(2);
      expect(acquireMany).toHaveBeenCalledTimes(2);
    });

    it('charges the global quota once after provider capacity admits the request', async () => {
      const acquire = vi.spyOn(RateLimiter.prototype, 'acquire').mockResolvedValue(undefined);
      const acquireMany = vi
        .spyOn(RateLimiter.prototype, 'acquireMany')
        .mockResolvedValue(true);
      const get = vi.spyOn(FetchHttpClient.prototype, 'get').mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      const configuredAdapter = new MemoryAdapter();
      const configuredPlug = plugFn({
        database: configuredAdapter,
        auth: { async authenticate() { return { userId: 'test-user' }; } },
        baseUrl: 'https://test.com',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        integrations: { test: { type: 'api-key', apiKey: 'key' } },
        rateLimit: {
          enabled: true,
          global: { requests: 25, window: 1000 },
        },
      });
      const provider = mockProvider('test', { getData: mockResponse({ ok: true }) });
      provider.rateLimit = { requests: 1, window: 60_000 };
      provider.actions.getData.execute = async (_params, context) => {
        await context.http.get('/quota-test');
        return { ok: true };
      };
      configuredPlug.providers.register(provider);
      await configuredAdapter.createConnection(mockConnection('test-user', 'test'));

      await configuredPlug.test.getData({ userId: 'test-user', params: {} });

      expect(acquireMany).toHaveBeenCalledTimes(1);
      expect(acquire).toHaveBeenCalledTimes(1);
      expect(acquire).toHaveBeenCalledWith('global', { requests: 25, window: 1000 });
      expect(acquireMany.mock.invocationCallOrder[0]).toBeLessThan(
        acquire.mock.invocationCallOrder[0]
      );
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('should execute an action successfully', async () => {
      const provider = mockProvider('test', {
        'getData': mockResponse({ data: 'test-data' }),
      });

      plug.providers.register(provider);

      // Create a mock connection
      const connection = mockConnection('test-user', 'test');
      await adapter.createConnection(connection);

      const result = await plug.test.getData({
        userId: 'test-user',
        params: {},
      });

      expect(result).toEqual({ data: 'test-data' });
    });

    it('does not cache mutating actions unless cache is explicitly requested', async () => {
      let executions = 0;
      const provider = mockProvider('test', {
        'createThing': mockResponse({ count: 0 }),
      });
      provider.actions.createThing.execute = async () => {
        executions += 1;
        return { count: executions };
      };

      plug.providers.register(provider);
      await adapter.createConnection(mockConnection('test-user', 'test'));

      const first = await plug.test.createThing({
        userId: 'test-user',
        params: {},
      });
      const second = await plug.test.createThing({
        userId: 'test-user',
        params: {},
      });
      const explicitlyCached = await plug.test.createThing({
        userId: 'test-user',
        params: {},
        cache: true,
      });
      const explicitCacheHit = await plug.test.createThing({
        userId: 'test-user',
        params: {},
        cache: true,
      });

      expect(first).toEqual({ count: 1 });
      expect(second).toEqual({ count: 2 });
      expect(explicitlyCached).toEqual({ count: 3 });
      expect(explicitCacheHit).toEqual({ count: 3 });
      expect(executions).toBe(3);
    });

    it('caches cacheable actions by default', async () => {
      let executions = 0;
      const provider = mockProvider('test', {
        'getThing': mockResponse({ count: 0 }),
      });
      provider.actions.getThing.cacheable = true;
      provider.actions.getThing.execute = async () => {
        executions += 1;
        return { count: executions };
      };

      plug.providers.register(provider);
      await adapter.createConnection(mockConnection('test-user', 'test'));

      const first = await plug.test.getThing({
        userId: 'test-user',
        params: {},
      });
      const second = await plug.test.getThing({
        userId: 'test-user',
        params: {},
      });

      expect(first).toEqual({ count: 1 });
      expect(second).toEqual({ count: 1 });
      expect(executions).toBe(1);
    });

    it('separates explicit cache entries by resolved connection', async () => {
      let executions = 0;
      const provider = mockProvider('test', {
        'getProfile': mockResponse({ connectionId: '' }),
      });
      provider.actions.getProfile.execute = async (_params, context) => {
        executions += 1;
        return { connectionId: context.connectionId };
      };

      plug.providers.register(provider);
      const connectionA = { ...mockConnection('test-user', 'test'), id: 'conn-a' };
      const connectionB = { ...mockConnection('test-user', 'test'), id: 'conn-b' };
      await adapter.createConnection(connectionA);
      await adapter.createConnection(connectionB);

      const firstA = await plug.test.getProfile({
        userId: 'test-user',
        connectionId: 'conn-a',
        params: {},
        cache: true,
      });
      const secondA = await plug.test.getProfile({
        userId: 'test-user',
        connectionId: 'conn-a',
        params: {},
        cache: true,
      });
      const firstB = await plug.test.getProfile({
        userId: 'test-user',
        connectionId: 'conn-b',
        params: {},
        cache: true,
      });

      expect(firstA).toEqual({ connectionId: 'conn-a' });
      expect(secondA).toEqual({ connectionId: 'conn-a' });
      expect(firstB).toEqual({ connectionId: 'conn-b' });
      expect(executions).toBe(2);
    });

    it('serializes concurrent mail.sync actions for the same connection', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const provider = mockProvider('test', {
        'mail.sync': mockResponse({ ok: true }),
      });

      provider.actions['mail.sync'].execute = async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { ok: true };
      };

      plug.providers.register(provider);
      const connection = mockConnection('test-user', 'test');
      await adapter.createConnection(connection);

      await Promise.all([
        plug.test['mail.sync']({
          userId: 'test-user',
          params: {},
          cache: false,
        }),
        plug.test['mail.sync']({
          userId: 'test-user',
          params: {},
          cache: false,
        }),
      ]);

      expect(maxInFlight).toBe(1);
    });

    it('applies the per-call timeout to provider HTTP requests', async () => {
      const provider = mockProvider('test', {
        'slowRequest': mockResponse({ ok: true }),
      });
      provider.actions.slowRequest.execute = async (_params, context) => {
        return (await context.http.get('https://mock-test.com/slow')).data;
      };

      plug.providers.register(provider);
      await adapter.createConnection(mockConnection('test-user', 'test'));
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((
        (_input, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
      ) as typeof fetch);

      try {
        await expect(
          plug.test.slowRequest({
            userId: 'test-user',
            params: {},
            timeout: 10,
            retry: { maxAttempts: 1 },
          })
        ).rejects.toThrow('Request timeout after 10ms');
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('should handle action errors', async () => {
      const provider = mockProvider('test', {
        'failingAction': mockResponse(null, { delay: 0 }),
      });

      // Override the action to throw an error
      provider.actions.failingAction.execute = async () => {
        throw new Error('Action failed');
      };

      plug.providers.register(provider);

      const connection = mockConnection('test-user', 'test');
      await adapter.createConnection(connection);

      await expect(
        plug.test.failingAction({
          userId: 'test-user',
          params: {},
        })
      ).rejects.toThrow('Action failed');
    });

    it('applies per-call retry options', async () => {
      let attempts = 0;
      const provider = mockProvider('test', {
        'mutatingAction': mockResponse({ ok: true }),
      });
      provider.actions.mutatingAction.execute = async () => {
        attempts += 1;
        throw Object.assign(new Error('temporary failure'), { status: 500 });
      };

      plug.providers.register(provider);
      await adapter.createConnection(mockConnection('test-user', 'test'));

      await expect(
        plug.test.mutatingAction({
          userId: 'test-user',
          params: {},
          retry: { maxAttempts: 1 },
        })
      ).rejects.toThrow('temporary failure');
      expect(attempts).toBe(1);
    });

    it('does not automatically retry actions without an idempotency opt-in', async () => {
      let attempts = 0;
      const provider = mockProvider('test', {
        'mutatingAction': mockResponse({ ok: true }),
      });
      provider.actions.mutatingAction.execute = async () => {
        attempts += 1;
        throw Object.assign(new Error('temporary failure'), { status: 500 });
      };

      plug.providers.register(provider);
      await adapter.createConnection(mockConnection('test-user', 'test'));

      await expect(
        plug.test.mutatingAction({
          userId: 'test-user',
          params: {},
        })
      ).rejects.toThrow('temporary failure');
      expect(attempts).toBe(1);
    });
  });

  describe('Batch Execution', () => {
    it('should execute multiple actions in batch', async () => {
      const provider = mockProvider('test', {
        'action1': mockResponse({ result: 1 }),
        'action2': mockResponse({ result: 2 }),
      });

      plug.providers.register(provider);

      const connection = mockConnection('test-user', 'test');
      await adapter.createConnection(connection);

      const results = await plug.batch([
        {
          provider: 'test',
          action: 'action1',
          userId: 'test-user',
          params: {},
        },
        {
          provider: 'test',
          action: 'action2',
          userId: 'test-user',
          params: {},
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('preserves default caching for cacheable batch actions', async () => {
      let executions = 0;
      const provider = mockProvider('test', {
        'getBatchValue': mockResponse({ count: 0 }),
      });
      provider.actions.getBatchValue.cacheable = true;
      provider.actions.getBatchValue.execute = async () => {
        executions += 1;
        return { count: executions };
      };

      plug.providers.register(provider);
      await adapter.createConnection(mockConnection('test-user', 'test'));

      const action = {
        provider: 'test',
        action: 'getBatchValue',
        userId: 'test-user',
        params: {},
      };
      await plug.batch([action]);
      const second = await plug.batch([action]);

      expect(second[0]?.data).toEqual({ count: 1 });
      expect(second[0]?.cached).toBe(true);
      expect(executions).toBe(1);
    });
  });

  describe('Metrics', () => {
    it('should collect metrics', async () => {
      const metrics = await plug.getMetrics({
        timeRange: 'last-24h',
        groupBy: 'provider',
      });

      expect(metrics).toBeDefined();
      expect(metrics.totalRequests).toBeDefined();
      expect(metrics.successRate).toBeDefined();
    });
  });
});
