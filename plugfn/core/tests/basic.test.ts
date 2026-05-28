import { describe, it, expect, beforeEach } from 'vitest';
import { plugFn } from '../src/index.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { mockProvider, mockResponse, mockConnection } from '../src/testing/index.js';

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

  describe('Action Execution', () => {
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

    it('does not cache actions unless cache is explicitly requested', async () => {
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

      expect(first).toEqual({ count: 1 });
      expect(second).toEqual({ count: 2 });
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
