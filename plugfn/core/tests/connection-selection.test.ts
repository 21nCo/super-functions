import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { plugFn } from '../src/core/plug-fn.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { ConnectionStatus, type Connection } from '../src/types/connection.js';
import { AuthType, type Provider } from '../src/types/provider.js';

describe('deterministic connection selection', () => {
  it('prefers explicit connectionId when provided', async () => {
    const adapter = new MemoryAdapter();
    const plug = createPlug(adapter);

    const oldConnection = createConnection({
      id: 'conn_old',
      userId: 'user-1',
      provider: 'test',
      connectedAt: new Date('2026-03-10T00:00:00.000Z'),
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-10T00:00:00.000Z'),
      lastUsedAt: new Date('2026-03-10T00:00:00.000Z'),
    });
    const newConnection = createConnection({
      id: 'conn_new',
      userId: 'user-1',
      provider: 'test',
      connectedAt: new Date('2026-03-11T00:00:00.000Z'),
      createdAt: new Date('2026-03-11T00:00:00.000Z'),
      updatedAt: new Date('2026-03-11T00:00:00.000Z'),
      lastUsedAt: new Date('2026-03-11T00:00:00.000Z'),
    });

    await adapter.createConnection(oldConnection);
    await adapter.createConnection(newConnection);

    const result = await plug.test.getConnection({
      userId: 'user-1',
      connectionId: 'conn_old',
      params: {},
    });

    expect(result.connectionId).toBe('conn_old');
  });

  it('selects latest healthy connection deterministically', async () => {
    const adapter = new MemoryAdapter();
    const plug = createPlug(adapter);

    await adapter.createConnection(
      createConnection({
        id: 'conn_1',
        userId: 'user-1',
        provider: 'test',
        connectedAt: new Date('2026-03-10T00:00:00.000Z'),
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        updatedAt: new Date('2026-03-10T00:00:00.000Z'),
        lastUsedAt: new Date('2026-03-10T00:00:00.000Z'),
      })
    );
    await adapter.createConnection(
      createConnection({
        id: 'conn_2',
        userId: 'user-1',
        provider: 'test',
        connectedAt: new Date('2026-03-11T00:00:00.000Z'),
        createdAt: new Date('2026-03-11T00:00:00.000Z'),
        updatedAt: new Date('2026-03-11T00:00:00.000Z'),
        lastUsedAt: new Date('2026-03-11T00:00:00.000Z'),
      })
    );

    const result = await plug.test.getConnection({
      userId: 'user-1',
      params: {},
    });

    expect(result.connectionId).toBe('conn_2');
  });

  it('uses connectionId as deterministic tie-breaker when timestamps are equal', async () => {
    const adapter = new MemoryAdapter();
    const plug = createPlug(adapter);

    const tiedTimestamp = new Date('2026-03-11T00:00:00.000Z');
    await adapter.createConnection(
      createConnection({
        id: 'conn_1',
        userId: 'user-1',
        provider: 'test',
        connectedAt: tiedTimestamp,
        createdAt: tiedTimestamp,
        updatedAt: tiedTimestamp,
      })
    );
    await adapter.createConnection(
      createConnection({
        id: 'conn_2',
        userId: 'user-1',
        provider: 'test',
        connectedAt: tiedTimestamp,
        createdAt: tiedTimestamp,
        updatedAt: tiedTimestamp,
      })
    );

    const result = await plug.test.getConnection({
      userId: 'user-1',
      params: {},
    });

    expect(result.connectionId).toBe('conn_1');
  });

  it('uses connectedAt as secondary priority before createdAt', async () => {
    const adapter = new MemoryAdapter();
    const plug = createPlug(adapter);

    await adapter.createConnection(
      createConnection({
        id: 'conn_older_connected',
        userId: 'user-1',
        provider: 'test',
        connectedAt: new Date('2026-03-10T00:00:00.000Z'),
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
        updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      })
    );
    await adapter.createConnection(
      createConnection({
        id: 'conn_newer_connected',
        userId: 'user-1',
        provider: 'test',
        connectedAt: new Date('2026-03-11T00:00:00.000Z'),
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
        updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      })
    );

    const result = await plug.test.getConnection({
      userId: 'user-1',
      params: {},
    });

    expect(result.connectionId).toBe('conn_newer_connected');
  });
});

function createPlug(adapter: MemoryAdapter) {
  const plug = plugFn({
    database: adapter,
    auth: {
      async getUserId() {
        return 'user-1';
      },
      async requireAuth() {
        return 'user-1';
      },
    },
    baseUrl: 'https://app.21n.co',
    encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    integrations: {
      test: {
        type: 'api-key',
        apiKey: 'api-key',
      },
    },
  });

  const provider: Provider = {
    name: 'test',
    displayName: 'Test',
    version: '1.0.0',
    description: 'Test provider',
    baseUrl: 'https://example.com',
    auth: {
      type: AuthType.ApiKey,
      config: {},
    },
    actions: {
      getConnection: {
        name: 'getConnection',
        displayName: 'Get Connection',
        description: 'Returns selected connection id',
        parameters: z.object({}),
        returns: z.object({
          connectionId: z.string(),
        }),
        execute: async (_params, context) => {
          return {
            connectionId: context.connectionId as string,
          };
        },
      },
    },
  };

  plug.providers.register(provider);
  return plug;
}

function createConnection(input: {
  id: string;
  userId: string;
  provider: string;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
}): Connection {
  return {
    id: input.id,
    userId: input.userId,
    provider: input.provider,
    status: ConnectionStatus.Active,
    credentials: {
      encrypted: 'mock-encrypted-data',
      algorithm: 'aes-256-gcm',
    },
    connectedAt: input.connectedAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    lastUsedAt: input.lastUsedAt,
  };
}
