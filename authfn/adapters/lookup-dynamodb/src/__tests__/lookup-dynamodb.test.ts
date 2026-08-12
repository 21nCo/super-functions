import { describe, expect, it } from 'vitest';
import {
  AuthFnDynamoDbLookupStoreError,
  createDynamoDbRegionLookupStore
} from '../index.js';

describe('@authfn/lookup-dynamodb', () => {
  it('queries by PK and maps lookup hits and misses', async () => {
    const sent: unknown[] = [];
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send(command: any) {
          sent.push(command.input);
          return {
            Items: [
              {
                PK: 'ada@example.com',
                SK: 'LOOKUP',
                identifier: 'ada@example.com',
                userId: 'user_1',
                regionId: 'eu-west-1',
                authority: 'https://eu.account.example.com',
                createdAt: '2026-04-24T00:00:00.000Z',
                updatedAt: '2026-04-24T00:00:00.000Z'
              }
            ]
          };
        }
      } as any
    });

    await expect(store.getByIdentifier('ada@example.com')).resolves.toMatchObject({
      identifier: 'ada@example.com',
      userId: 'user_1',
      regionId: 'eu-west-1',
      authority: 'https://eu.account.example.com'
    });
    expect(sent[0]).toMatchObject({
      TableName: 'authfn-region-lookup',
      KeyConditionExpression: '#pk = :identifier',
      Limit: 1
    });
  });

  it('returns conflict details when conditional put loses the race', async () => {
    let calls = 0;
    const sent: unknown[] = [];
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send(command: any) {
          calls += 1;
          sent.push(command.input);
          if (command.input.ConditionExpression) {
            const error = new Error('conditional failed');
            error.name = 'ConditionalCheckFailedException';
            throw error;
          }
          return {
            Items: [
              {
                PK: 'ada@example.com',
                SK: 'LOOKUP',
                identifier: 'ada@example.com',
                regionId: 'us-east-1',
                authority: 'https://us.account.example.com',
                createdAt: '2026-04-24T00:00:00.000Z',
                updatedAt: '2026-04-24T00:00:00.000Z'
              }
            ]
          };
        }
      } as any
    });

    await expect(store.putIfAbsent({
      identifier: 'ada@example.com',
      userId: 'user_2',
      regionId: 'eu-west-1',
      authority: 'https://eu.account.example.com',
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:00:00.000Z'
    })).resolves.toEqual({
      inserted: false,
      existing: expect.objectContaining({
        regionId: 'us-east-1'
      })
    });
    expect(calls).toBe(2);
    expect(sent[0]).toMatchObject({
      Item: {
        PK: 'ada@example.com',
        SK: 'LOOKUP',
        regionId: 'eu-west-1'
      },
      ConditionExpression: 'attribute_not_exists(PK)'
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

    await expect(store.getByIdentifier('ada@example.com')).rejects.toMatchObject({
      name: 'AuthFnDynamoDbLookupStoreError',
      operation: 'getByIdentifier',
      retryable: true
    } satisfies Partial<AuthFnDynamoDbLookupStoreError>);
  });

  it('rejects corrupt records that are missing the authoritative regionId field', async () => {
    const store = createDynamoDbRegionLookupStore({
      tableName: 'authfn-region-lookup',
      documentClient: {
        async send() {
          return {
            Items: [
              {
                PK: 'ada@example.com',
                SK: 'us-east-1',
                identifier: 'ada@example.com',
                authority: 'https://us.account.example.com',
                createdAt: '2026-04-24T00:00:00.000Z',
                updatedAt: '2026-04-24T00:00:00.000Z'
              }
            ]
          };
        }
      } as any
    });

    await expect(store.getByIdentifier('ada@example.com')).rejects.toMatchObject({
      name: 'AuthFnDynamoDbLookupStoreError',
      operation: 'getByIdentifier'
    });
  });
});
