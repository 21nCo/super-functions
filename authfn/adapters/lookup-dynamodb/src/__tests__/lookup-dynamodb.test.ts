import { describe, expect, it } from 'vitest';
import {
  AuthFnDynamoDbLookupStoreError,
  createDynamoDbRegionLookupStore
} from '../index.js';

describe('@authfn/lookup-dynamodb', () => {
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
      ConditionExpression: 'attribute_not_exists(PK)'
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
