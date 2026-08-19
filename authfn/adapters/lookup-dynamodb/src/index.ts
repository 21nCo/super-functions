import {
  DynamoDBClient,
  type DynamoDBClientConfig
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand
} from '@aws-sdk/lib-dynamodb';
import type { ConditionalKVStoreAdapter } from '@superfunctions/db';

const LOOKUP_RECORD_SORT_KEY = 'LOOKUP';

export interface DynamoDbRegionLookupStoreOptions extends DynamoDBClientConfig {
  tableName: string;
  documentClient?: DynamoDBDocumentClient;
  documentClientConfig?: Parameters<typeof DynamoDBDocumentClient.from>[1];
  consistentRead?: boolean;
  /** DynamoDB TTL attribute. Set to false when table TTL is intentionally disabled. */
  ttlAttributeName?: string | false;
  now?: () => Date;
}

export class AuthFnDynamoDbLookupStoreError extends Error {
  readonly operation: string;
  readonly retryable: boolean;

  constructor(operation: string, cause: unknown) {
    super(`AuthFn DynamoDB lookup store failed during ${operation}`, { cause });
    this.name = 'AuthFnDynamoDbLookupStoreError';
    this.operation = operation;
    this.retryable = isRetryableDynamoError(cause);
  }
}

export function createDynamoDbRegionLookupStore(
  options: DynamoDbRegionLookupStoreOptions
): ConditionalKVStoreAdapter {
  const client = options.documentClient
    ?? DynamoDBDocumentClient.from(new DynamoDBClient(options), options.documentClientConfig);
  const ttlAttributeName = options.ttlAttributeName === undefined ? 'expiresAt' : options.ttlAttributeName;
  const now = options.now ?? (() => new Date());

  const get: ConditionalKVStoreAdapter['get'] = async (key) => {
    try {
      const result = await client.send(new GetCommand({
        TableName: options.tableName,
        Key: itemKey(key),
        ConsistentRead: options.consistentRead
      }));
      return readValue(result.Item);
    } catch (error) {
      throw new AuthFnDynamoDbLookupStoreError('get', error);
    }
  };

  const setIfAbsent: ConditionalKVStoreAdapter['setIfAbsent'] = async (input) => {
    try {
      await client.send(new PutCommand({
        TableName: options.tableName,
        Item: toItem(input, ttlAttributeName, now),
        ConditionExpression: 'attribute_not_exists(PK)'
      }));
      return { inserted: true };
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        const existing = await get(input.key);
        return {
          inserted: false,
          existing: existing ?? undefined
        };
      }
      throw new AuthFnDynamoDbLookupStoreError('setIfAbsent', error);
    }
  };

  return {
    get,

    async set(input) {
      try {
        await client.send(new PutCommand({
          TableName: options.tableName,
          Item: toItem(input, ttlAttributeName, now)
        }));
      } catch (error) {
        throw new AuthFnDynamoDbLookupStoreError('set', error);
      }
    },

    setIfAbsent,

    async compareAndSet(input) {
      if (input.expected === null) {
        const result = await setIfAbsent(input);
        return {
          updated: result.inserted,
          existing: result.existing
        };
      }

      try {
        await client.send(new PutCommand({
          TableName: options.tableName,
          Item: toItem(input, ttlAttributeName, now),
          ConditionExpression: '#value = :expected',
          ExpressionAttributeNames: {
            '#value': 'value'
          },
          ExpressionAttributeValues: {
            ':expected': input.expected
          }
        }));
        return { updated: true };
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          const existing = await get(input.key);
          return {
            updated: false,
            existing: existing ?? undefined
          };
        }
        throw new AuthFnDynamoDbLookupStoreError('compareAndSet', error);
      }
    },

    async delete(key) {
      try {
        await client.send(new DeleteCommand({
          TableName: options.tableName,
          Key: itemKey(key)
        }));
      } catch (error) {
        throw new AuthFnDynamoDbLookupStoreError('delete', error);
      }
    }
  };
}

function itemKey(key: string): Record<string, string> {
  return {
    PK: key,
    SK: LOOKUP_RECORD_SORT_KEY
  };
}

function toItem(
  input: { key: string; value: string; ttlSeconds?: number },
  ttlAttributeName: string | false,
  now: () => Date
): Record<string, unknown> {
  const item: Record<string, unknown> = {
    ...itemKey(input.key),
    value: input.value
  };
  if (ttlAttributeName && input.ttlSeconds !== undefined) {
    item[ttlAttributeName] = Math.floor(now().getTime() / 1000) + input.ttlSeconds;
  }
  return item;
}

function readValue(item: Record<string, unknown> | undefined): string | null {
  if (!item) {
    return null;
  }
  if (typeof item.value !== 'string') {
    throw new Error('DynamoDB lookup record is missing value');
  }
  return item.value;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && (error as { name?: unknown }).name === 'ConditionalCheckFailedException'
  );
}

function isRetryableDynamoError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybe = error as {
    $retryable?: unknown;
    name?: unknown;
  };
  return Boolean(maybe.$retryable || maybe.name === 'ProvisionedThroughputExceededException');
}
