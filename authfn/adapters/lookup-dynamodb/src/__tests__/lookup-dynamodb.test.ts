import { describe, expect, it } from 'vitest';
import {
  AuthFnDynamoDbLookupStoreError,
  createDynamoDbIdentityPlacementDirectory,
  createDynamoDbRegionLookupStore
} from '../index.js';

describe('@authfn/lookup-dynamodb', () => {
  it('provides atomic identity-placement claims and epoch moves', async () => {
    let item: Record<string, unknown> | undefined;
    const sent: Array<Record<string, any>> = [];
    const directory = createDynamoDbIdentityPlacementDirectory({
      tableName: 'authfn-placement',
      consistencyModel: 'single-writer-strong',
      writerRegion: 'us-east-1',
      documentClientRegion: 'us-east-1',
      ttlAttributeName: false,
      documentClient: {
        async send(command: any) {
          const input = command.input as Record<string, any>;
          sent.push(input);
          if (input.Key) return { Item: item };
          if (input.ConditionExpression === 'attribute_not_exists(#pk)' && item) {
            const error = new Error('conditional failed');
            error.name = 'ConditionalCheckFailedException';
            throw error;
          }
          if (input.ConditionExpression === '#value = :expected' && item?.value !== input.ExpressionAttributeValues[':expected']) {
            const error = new Error('conditional failed');
            error.name = 'ConditionalCheckFailedException';
            throw error;
          }
          item = input.Item;
          return {};
        }
      } as any
    });
    const initial = {
      identityKey: 'person:ada',
      regionId: 'us-east-1',
      epoch: 1,
      state: 'active' as const,
      updatedAt: '2026-08-23T00:00:00.000Z'
    };
    expect((await directory.putIfAbsent(initial)).inserted).toBe(true);
    expect((await directory.compareAndSet({
      identityKey: initial.identityKey,
      expectedEpoch: 1,
      expectedState: 'active',
      placement: { ...initial, regionId: 'eu-west-1', epoch: 2 }
    })).updated).toBe(true);
    await expect(directory.get(initial.identityKey)).resolves.toMatchObject({
      regionId: 'eu-west-1',
      epoch: 2
    });
    expect(sent.some((input) => input.ConditionExpression === 'attribute_not_exists(#pk)')).toBe(true);
    expect(sent.some((input) => input.ConditionExpression === '#value = :expected')).toBe(true);
    expect(sent.some((input) => input.ConsistentRead === true)).toBe(true);
  });

  it('requires the strongly consistent single-writer placement model', () => {
    expect(() => createDynamoDbIdentityPlacementDirectory({
      tableName: 'authfn-placement',
      consistencyModel: 'eventual-global-table'
    } as any)).toThrow('single strongly consistent writer region');
  });

  it('requires a verifiable single writer region', () => {
    expect(() => createDynamoDbIdentityPlacementDirectory({
      tableName: 'authfn-placement',
      consistencyModel: 'single-writer-strong',
      writerRegion: 'us-east-1',
      documentClientRegion: 'eu-west-1',
      documentClient: { send: async () => ({}) } as any
    })).toThrow('documentClientRegion must match');
  });

  it('gets raw conditional KV values by composite lookup key', async () => {
    const sent: unknown[] = [];
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send(command: any) {
          sent.push(command.input);
          return {
            Item: {
              PK: 'authfn:region:ada@example.com',
              SK: 'LOOKUP',
              value: '{"regionId":"eu-west-1"}'
            }
          };
        }
      } as any
    });

    await expect(store.get('authfn:region:ada@example.com'))
      .resolves.toBe('{"regionId":"eu-west-1"}');
    expect(sent[0]).toMatchObject({
      TableName: 'authfn-region-lookup',
      Key: {
        PK: 'authfn:region:ada@example.com',
        SK: 'LOOKUP'
      }
    });
  });

  it('returns the existing raw value when conditional put loses the race', async () => {
    const sent: unknown[] = [];
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send(command: any) {
          sent.push(command.input);
          if (command.input.ConditionExpression) {
            const error = new Error('conditional failed');
            error.name = 'ConditionalCheckFailedException';
            throw error;
          }
          return {
            Item: {
              PK: 'authfn:region:ada@example.com',
              SK: 'LOOKUP',
              value: 'existing'
            }
          };
        }
      } as any
    });

    await expect(store.setIfAbsent({
      key: 'authfn:region:ada@example.com',
      value: 'attempted'
    })).resolves.toEqual({
      inserted: false,
      existing: 'existing'
    });
    expect(sent[0]).toMatchObject({
      Item: {
        PK: 'authfn:region:ada@example.com',
        SK: 'LOOKUP',
        value: 'attempted'
      },
      ConditionExpression: '(attribute_not_exists(#pk) OR #expiresAt <= :now)'
    });
  });

  it('reads legacy bare-key records and serializes them for lazy migration', async () => {
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send() {
          return {
            Item: {
              PK: 'ada@example.com',
              SK: 'LOOKUP',
              identifier: 'ada@example.com',
              userId: 'user:ada',
              regionId: 'eu-west-1',
              authority: 'https://eu.example.com',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z'
            }
          };
        }
      } as any
    });

    await expect(store.get('ada@example.com')).resolves.toBe(JSON.stringify({
      identifier: 'ada@example.com',
      userId: 'user:ada',
      regionId: 'eu-west-1',
      authority: 'https://eu.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }));
  });

  it('allows set-if-absent to replace an expired lookup item', async () => {
    const sent: any[] = [];
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      now: () => new Date('2026-08-19T00:00:00.000Z'),
      documentClient: {
        async send(command: any) {
          sent.push(command.input);
          return {};
        }
      } as any
    });

    await store.setIfAbsent({ key: 'lookup', value: 'value' });
    expect(sent[0]).toMatchObject({
      ConditionExpression: '(attribute_not_exists(#pk) OR #expiresAt <= :now)',
      ExpressionAttributeValues: {
        ':now': 1787097600
      }
    });
  });

  it('stores DynamoDB TTL as epoch seconds', async () => {
    const sent: unknown[] = [];
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      now: () => new Date('2026-04-24T00:00:00.000Z'),
      documentClient: {
        async send(command: any) {
          sent.push(command.input);
          return {};
        }
      } as any
    });

    await store.set({ key: 'key', value: 'value', ttlSeconds: 60 });
    expect(sent[0]).toMatchObject({
      Item: {
        PK: 'key',
        SK: 'LOOKUP',
        value: 'value',
        expiresAt: 1776988860
      }
    });
  });

  it('does not compare-and-set an expired lookup item', async () => {
    const sent: any[] = [];
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      now: () => new Date('2026-08-19T00:00:00.000Z'),
      documentClient: {
        async send(command: any) {
          sent.push(command.input);
          return {};
        }
      } as any
    });

    await store.compareAndSet({ key: 'lookup', expected: 'old', value: 'new' });
    expect(sent[0]).toMatchObject({
      ConditionExpression: '#value = :expected AND (attribute_not_exists(#expiresAt) OR #expiresAt > :now)',
      ExpressionAttributeNames: {
        '#value': 'value',
        '#expiresAt': 'expiresAt'
      },
      ExpressionAttributeValues: {
        ':expected': 'old',
        ':now': 1787097600
      }
    });
  });

  it('wraps unavailable DynamoDB errors in a typed adapter error', async () => {
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send() {
          const error = new Error('network down') as Error & { $retryable?: unknown };
          error.$retryable = {};
          throw error;
        }
      } as any
    });

    await expect(store.get('key')).rejects.toMatchObject({
      name: 'AuthFnDynamoDbLookupStoreError',
      operation: 'get',
      retryable: true
    } satisfies Partial<AuthFnDynamoDbLookupStoreError>);
  });

  it('rejects corrupt records that have no raw value', async () => {
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send() {
          return { Item: { PK: 'key', SK: 'LOOKUP' } };
        }
      } as any
    });

    await expect(store.get('key')).rejects.toMatchObject({
      name: 'AuthFnDynamoDbLookupStoreError',
      operation: 'get'
    });
  });
});
