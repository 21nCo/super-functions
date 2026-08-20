import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';

import { dynamoDbAtomicKVStore, dynamoDbIndexedDirectoryStore } from './index.js';

describe('dynamoDbAtomicKVStore', () => {
  it('uses an atomic conditional write for compare-and-set', async () => {
    let storedValue: string | undefined = 'before';
    const putCommands: PutCommand[] = [];
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof PutCommand) {
          putCommands.push(command);
          const expected = command.input.ExpressionAttributeValues?.[':expected'];
          if (storedValue !== expected) {
            throw conditionalCheckFailed();
          }
          storedValue = command.input.Item?.value as string;
          return {};
        }
        if (command instanceof GetCommand) {
          return storedValue === undefined ? {} : {
            Item: { value: storedValue },
          };
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbAtomicKVStore({
      tableName: 'runtime-store',
      documentClient,
    });

    const results = await Promise.all([
      store.compareAndSet!({ key: 'lease', expected: 'before', value: 'first' }),
      store.compareAndSet!({ key: 'lease', expected: 'before', value: 'second' }),
    ]);

    expect(results.filter((result) => result.updated)).toHaveLength(1);
    expect(results.filter((result) => !result.updated)).toHaveLength(1);
    expect(storedValue).toBe('first');
    expect(putCommands).toHaveLength(2);
    expect(putCommands[0]?.input.ConditionExpression).toContain('#value = :expected');
  });

  it('treats an absent or expired item as the null compare-and-set state', async () => {
    let putCommand: PutCommand | undefined;
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof PutCommand) {
          putCommand = command;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbAtomicKVStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.compareAndSet!({
      key: 'lease',
      expected: null,
      value: 'claimed',
    })).resolves.toEqual({ updated: true });

    expect(putCommand?.input.ConditionExpression).toBe(
      '(attribute_not_exists(#pk) OR #expiresAt <= :now)',
    );
    expect(putCommand?.input.ExpressionAttributeValues).not.toHaveProperty(':expected');
  });

  it('allows set-if-absent to replace an expired DynamoDB item', async () => {
    let putCommand: PutCommand | undefined;
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof PutCommand) {
          putCommand = command;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbAtomicKVStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.setIfAbsent({
      key: 'lease',
      value: 'claimed',
    })).resolves.toEqual({ inserted: true });

    expect(putCommand?.input.ConditionExpression).toBe(
      '(attribute_not_exists(#pk) OR #expiresAt <= :now)',
    );
    expect(putCommand?.input.ExpressionAttributeValues?.[':now']).toEqual(expect.any(Number));
  });

  it('increments the canonical value written by set and compare-and-set', async () => {
    let item: Record<string, unknown> = { value: '4' };
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof GetCommand) {
          return { Item: item };
        }
        if (command instanceof PutCommand) {
          const expected = command.input.ExpressionAttributeValues?.[':expected'];
          if (item.value !== expected) throw conditionalCheckFailed();
          item = command.input.Item as Record<string, unknown>;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbAtomicKVStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.incr({ key: 'counter', by: 3 })).resolves.toEqual({ value: 7 });
    await expect(store.get('counter')).resolves.toBe('7');
    expect(item).toMatchObject({ value: '7', itemType: 'kv' });
    expect(item).not.toHaveProperty('counter');
  });

  it('migrates a legacy counter item into the canonical value on increment', async () => {
    let item: Record<string, unknown> = { counter: 2 };
    let putCommand: PutCommand | undefined;
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof GetCommand) {
          return { Item: item };
        }
        if (command instanceof PutCommand) {
          putCommand = command;
          const expectedCounter = command.input.ExpressionAttributeValues?.[':expectedCounter'];
          if (item.counter !== expectedCounter) throw conditionalCheckFailed();
          item = command.input.Item as Record<string, unknown>;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbAtomicKVStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.incr({ key: 'counter' })).resolves.toEqual({ value: 3 });
    expect(putCommand?.input.ConditionExpression).toContain('#counter = :expectedCounter');
    await expect(store.get('counter')).resolves.toBe('3');
    expect(item).not.toHaveProperty('counter');
  });
});

describe('dynamoDbIndexedDirectoryStore', () => {
  it('uses strongly consistent authorization reads by default', async () => {
    let read: GetCommand | undefined;
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof GetCommand) {
          read = command;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbIndexedDirectoryStore({
      tableName: 'runtime-store',
      documentClient,
      consistentRead: false,
    });

    await expect(store.get('permission')).resolves.toBeNull();
    expect(read?.input.ConsistentRead).toBe(true);
  });

  it('allows an expired directory record to be claimed again', async () => {
    let transaction: TransactWriteCommand | undefined;
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof TransactWriteCommand) {
          transaction = command;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbIndexedDirectoryStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.putIfAbsent({
      key: 'directory-entry',
      value: 'claimed',
    })).resolves.toEqual({ inserted: true });

    const recordPut = transaction?.input.TransactItems?.find((item) => item.Put?.Item?.itemType === 'directoryRecord')?.Put;
    expect(recordPut?.ConditionExpression).toBe(
      '(attribute_not_exists(#pk) OR #expiresAt <= :now)',
    );
    expect(recordPut?.ExpressionAttributeValues?.[':now']).toEqual(expect.any(Number));
  });

  it('returns the winner when a transactional directory claim loses', async () => {
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof TransactWriteCommand) {
          const error = new Error('Transaction cancelled') as Error & {
            CancellationReasons?: Array<{ Code: string }>;
          };
          error.name = 'TransactionCanceledException';
          error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
          throw error;
        }
        if (command instanceof GetCommand) {
          return { Item: { dirKey: 'directory-entry', value: 'winner' } };
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbIndexedDirectoryStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.putIfAbsent({
      key: 'directory-entry',
      value: 'challenger',
    })).resolves.toEqual({
      inserted: false,
      existing: { key: 'directory-entry', value: 'winner' },
    });
  });

  it('expires index edges with their directory record', async () => {
    let transaction: TransactWriteCommand | undefined;
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof GetCommand) return {};
        if (command instanceof TransactWriteCommand) {
          transaction = command;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbIndexedDirectoryStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await store.put({
      key: 'user:1',
      value: 'region:eu',
      indexes: { email: 'ada@example.com' },
      ttlSeconds: 60,
    });

    const record = transaction?.input.TransactItems?.find(
      (item) => item.Put?.Item?.itemType === 'directoryRecord',
    )?.Put?.Item;
    const edge = transaction?.input.TransactItems?.find(
      (item) => item.Put?.Item?.itemType === 'directoryIndex',
    )?.Put?.Item;
    expect(record?.expiresAt).toEqual(expect.any(Number));
    expect(edge?.expiresAt).toBe(record?.expiresAt);
  });

  it('does not return a reclaimed record through a stale index edge', async () => {
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof QueryCommand) {
          return { Items: [{ dirKey: 'user:1' }] };
        }
        if (command instanceof GetCommand) {
          return {
            Item: {
              dirKey: 'user:1',
              value: 'region:us',
              indexes: { email: 'new@example.com' },
            },
          };
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbIndexedDirectoryStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.query({
      index: 'email',
      value: 'old@example.com',
    })).resolves.toEqual({ records: [] });
  });

  it('continues paginating until the requested number of live records is found', async () => {
    const queries: QueryCommand[] = [];
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof QueryCommand) {
          queries.push(command);
          if (queries.length === 1) {
            return {
              Items: [{ dirKey: 'expired' }],
              LastEvaluatedKey: { PK: 'index', SK: 'expired' },
            };
          }
          return { Items: [{ dirKey: 'live' }] };
        }
        if (command instanceof GetCommand) {
          const key = String(command.input.Key?.PK);
          return key.includes('expired')
            ? {
                Item: {
                  dirKey: 'expired',
                  value: 'old',
                  indexes: { email: 'ada@example.com' },
                  expiresAt: Math.floor(Date.now() / 1000) - 1,
                },
              }
            : {
                Item: {
                  dirKey: 'live',
                  value: 'current',
                  indexes: { email: 'ada@example.com' },
                },
              };
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbIndexedDirectoryStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.query({
      index: 'email',
      value: 'ada@example.com',
      limit: 1,
    })).resolves.toEqual({
      records: [{
        key: 'live',
        value: 'current',
        indexes: { email: 'ada@example.com' },
      }],
    });
    expect(queries).toHaveLength(2);
    expect(queries[1]?.input.ExclusiveStartKey).toEqual({
      PK: 'index',
      SK: 'expired',
    });
  });

  it('does not delete and put the same index edge in one transaction', async () => {
    let transaction: TransactWriteCommand | undefined;
    const existing = {
      key: 'user:1',
      value: 'region:eu',
      indexes: { email: 'ada@example.com' },
    };
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof GetCommand) {
          return {
            Item: {
              dirKey: existing.key,
              value: existing.value,
              indexes: existing.indexes,
            },
          };
        }
        if (command instanceof TransactWriteCommand) {
          transaction = command;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbIndexedDirectoryStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await store.put({ ...existing, value: 'region:us' });

    expect(transaction?.input.TransactItems?.filter((item) => item.Delete)).toHaveLength(0);
    expect(transaction?.input.TransactItems?.filter(
      (item) => item.Put?.Item?.itemType === 'directoryIndex',
    )).toHaveLength(1);
  });
});

function conditionalCheckFailed(): Error {
  const error = new Error('The conditional request failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}
