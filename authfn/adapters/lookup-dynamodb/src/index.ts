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
import { AuthFnConfigError } from 'authfn';
import { createStoreBackedAuthFnPlacementDirectory } from 'authfn/core/gateway-routing';
import type { AuthFnIdentityPlacementDirectoryAdapter } from 'authfn/plugin-types';

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

export interface DynamoDbIdentityPlacementDirectoryOptions extends DynamoDbRegionLookupStoreOptions {
  /**
   * Required acknowledgement that every placement read and conditional write
   * uses one strongly consistent DynamoDB writer region. Local Global Table
   * replicas are eventually consistent with one another and cannot provide
   * the cross-region uniqueness contract on their own.
   */
  consistencyModel: 'single-writer-strong';
  /** Region that owns every authoritative placement write. */
  writerRegion: string;
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
      return readValue(result.Item, ttlAttributeName, now);
    } catch (error) {
      throwLookupStoreError('get', error);
    }
  };

  const setIfAbsent: ConditionalKVStoreAdapter['setIfAbsent'] = async (input) => {
    try {
      const replaceExpired = typeof ttlAttributeName === 'string';
      await client.send(new PutCommand({
        TableName: options.tableName,
        Item: toItem(input, ttlAttributeName, now),
        ConditionExpression: replaceExpired
          ? '(attribute_not_exists(#pk) OR #expiresAt <= :now)'
          : 'attribute_not_exists(#pk)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          ...(replaceExpired ? { '#expiresAt': ttlAttributeName } : {})
        },
        ...(replaceExpired
          ? {
              ExpressionAttributeValues: {
                ':now': Math.floor(now().getTime() / 1000),
              },
            }
          : {})
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
      throwLookupStoreError('setIfAbsent', error);
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
        throwLookupStoreError('set', error);
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
        const rejectExpired = typeof ttlAttributeName === 'string';
        await client.send(new PutCommand({
          TableName: options.tableName,
          Item: toItem(input, ttlAttributeName, now),
          ConditionExpression: rejectExpired
            ? '#value = :expected AND (attribute_not_exists(#expiresAt) OR #expiresAt > :now)'
            : '#value = :expected',
          ExpressionAttributeNames: rejectExpired
            ? { '#value': 'value', '#expiresAt': ttlAttributeName }
            : { '#value': 'value' },
          ExpressionAttributeValues: rejectExpired
            ? { ':expected': input.expected, ':now': Math.floor(now().getTime() / 1000) }
            : { ':expected': input.expected }
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
        throwLookupStoreError('compareAndSet', error);
      }
    },

    async delete(key) {
      try {
        await client.send(new DeleteCommand({
          TableName: options.tableName,
          Key: itemKey(key)
        }));
      } catch (error) {
        throwLookupStoreError('delete', error);
      }
    }
  };
}

/** Uses the same DynamoDB atomic primitives for the canonical identity-placement directory. */
export function createDynamoDbIdentityPlacementDirectory(
  options: DynamoDbIdentityPlacementDirectoryOptions
): AuthFnIdentityPlacementDirectoryAdapter {
  if (options.consistencyModel !== 'single-writer-strong') {
    throw new AuthFnConfigError(
      'DynamoDB identity placement requires a single strongly consistent writer region'
    );
  }
  if (!options.writerRegion?.trim()) {
    throw new AuthFnConfigError('DynamoDB identity placement requires an explicit writerRegion');
  }
  const {
    consistencyModel: _consistencyModel,
    writerRegion: _writerRegion,
    ...lookupOptions
  } = options;
  const documentClient = options.documentClient
    ? createRegionVerifiedDocumentClient(options.documentClient, options.writerRegion)
    : undefined;
  return createStoreBackedAuthFnPlacementDirectory(createDynamoDbRegionLookupStore({
    ...lookupOptions,
    region: options.writerRegion,
    documentClient,
    consistentRead: true
  }));
}

function createRegionVerifiedDocumentClient(
  client: DynamoDBDocumentClient,
  writerRegion: string
): DynamoDBDocumentClient {
  const configuredRegion = (
    client as DynamoDBDocumentClient & {
      config?: { region?: string | (() => string | Promise<string>) }
    }
  ).config?.region;
  if (!configuredRegion) {
    throw new AuthFnConfigError(
      'DynamoDB placement documentClient must expose its configured region'
    );
  }
  let validation: Promise<void> | undefined;
  return {
    async send(command: Parameters<DynamoDBDocumentClient['send']>[0]) {
      validation ??= Promise.resolve(
        typeof configuredRegion === 'function' ? configuredRegion() : configuredRegion
      ).then((actualRegion) => {
        if (actualRegion !== writerRegion) {
          throw new AuthFnConfigError(
            'DynamoDB placement documentClient region must match the single writerRegion'
          );
        }
      });
      await validation;
      return client.send(command as never);
    }
  } as unknown as DynamoDBDocumentClient;
}

function throwLookupStoreError(operation: string, error: unknown): never {
  if (error instanceof AuthFnConfigError) throw error;
  throw new AuthFnDynamoDbLookupStoreError(operation, error);
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

function readValue(
  item: Record<string, unknown> | undefined,
  ttlAttributeName: string | false,
  now: () => Date
): string | null {
  if (!item) {
    return null;
  }
  if (
    ttlAttributeName
    && typeof item[ttlAttributeName] === 'number'
    && item[ttlAttributeName] <= Math.floor(now().getTime() / 1000)
  ) {
    return null;
  }
  if (typeof item.value !== 'string') {
    const legacy = legacyLookupRecord(item);
    if (legacy) {
      return JSON.stringify(legacy);
    }
    throw new Error('DynamoDB lookup record is missing value');
  }
  return item.value;
}

function legacyLookupRecord(item: Record<string, unknown>): Record<string, unknown> | null {
  const identifier = item.identifier ?? item.PK;
  if (
    typeof identifier !== 'string'
    || typeof item.regionId !== 'string'
    || typeof item.authority !== 'string'
    || typeof item.createdAt !== 'string'
    || typeof item.updatedAt !== 'string'
  ) {
    return null;
  }
  return {
    identifier,
    ...(typeof item.userId === 'string' ? { userId: item.userId } : {}),
    regionId: item.regionId,
    authority: item.authority,
    ...(typeof item.domain === 'string' ? { domain: item.domain } : {}),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
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
