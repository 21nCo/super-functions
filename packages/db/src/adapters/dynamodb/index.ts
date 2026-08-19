import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  AtomicKVStoreAdapter,
  IndexedDirectoryRecord,
  IndexedDirectoryStoreAdapter,
  ProvisionableStoreAdapter,
  StoreProvisioningPlan,
} from '../../adapter/types.js';

const KV_SORT_KEY = 'KV';
const DIRECTORY_RECORD_SORT_KEY = 'RECORD';

export interface DynamoDbStoreOptions extends DynamoDBClientConfig {
  tableName: string;
  documentClient?: DynamoDBDocumentClient;
  documentClientConfig?: Parameters<typeof DynamoDBDocumentClient.from>[1];
  consistentRead?: boolean;
}

export interface DynamoDbSingleTableDefinition {
  tableName: string;
  partitionKey: 'PK';
  sortKey: 'SK';
  ttlAttribute: 'expiresAt';
  globalSecondaryIndexes: [];
}

export function dynamoDbSingleTableDefinition(tableName: string): DynamoDbSingleTableDefinition {
  return {
    tableName,
    partitionKey: 'PK',
    sortKey: 'SK',
    ttlAttribute: 'expiresAt',
    globalSecondaryIndexes: [],
  };
}

export function dynamoDbStoreProvisioningPlan(tableName: string): StoreProvisioningPlan {
  return {
    id: `dynamodb:${tableName}`,
    provider: 'dynamodb',
    resources: [
      {
        type: 'dynamodb-table',
        name: tableName,
        tableName,
        billingMode: 'PAY_PER_REQUEST',
        attributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        keySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        ttl: {
          attributeName: 'expiresAt',
          enabled: true,
        },
        globalSecondaryIndexes: [],
      },
    ],
    notes: [
      'This single table backs AtomicKVStoreAdapter and IndexedDirectoryStoreAdapter records.',
      'Directory secondary indexes are stored as index edge items under PK = IDX#<index>#<value>; no DynamoDB GSI is required.',
    ],
  };
}

export function dynamoDbAtomicKVStore(
  options: DynamoDbStoreOptions,
): AtomicKVStoreAdapter & ProvisionableStoreAdapter {
  const client = documentClient(options);

  return {
    getProvisioningPlan() {
      return dynamoDbStoreProvisioningPlan(options.tableName);
    },
    async get(key) {
      const result = await client.send(new GetCommand({
        TableName: options.tableName,
        Key: { PK: kvPk(key), SK: KV_SORT_KEY },
        ConsistentRead: options.consistentRead,
      }));
      const item = result.Item;
      if (!item || isExpired(item.expiresAt)) return null;
      if (typeof item.value === 'string') return item.value;
      if (typeof item.counter === 'number') return String(item.counter);
      return null;
    },
    async set(input) {
      await client.send(new PutCommand({
        TableName: options.tableName,
        Item: kvItem(input.key, input.value, input.ttlSeconds),
      }));
    },
    async setIfAbsent(input) {
      try {
        await client.send(new PutCommand({
          TableName: options.tableName,
          Item: kvItem(input.key, input.value, input.ttlSeconds),
          ConditionExpression: 'attribute_not_exists(PK)',
        }));
        return { inserted: true };
      } catch (error) {
        if (!isConditionalCheckFailed(error)) throw error;
        const existing = await this.get(input.key);
        return { inserted: false, ...(existing === null ? {} : { existing }) };
      }
    },
    async compareAndSet(input) {
      const existing = await this.get(input.key);
      if (existing !== input.expected) {
        return { updated: false, ...(existing === null ? {} : { existing }) };
      }
      await this.set(input);
      return { updated: true };
    },
    async delete(key) {
      await client.send(new DeleteCommand({
        TableName: options.tableName,
        Key: { PK: kvPk(key), SK: KV_SORT_KEY },
      }));
    },
    async incr(input) {
      const ttl = ttlEpochSeconds(input.ttlSeconds);
      const result = await client.send(new UpdateCommand({
        TableName: options.tableName,
        Key: { PK: kvPk(input.key), SK: KV_SORT_KEY },
        UpdateExpression: [
          `SET #itemType = :itemType${ttl ? ', #expiresAt = :expiresAt' : ''}`,
          'ADD #counter :by',
        ].join(' '),
        ExpressionAttributeNames: {
          '#counter': 'counter',
          '#itemType': 'itemType',
          ...(ttl ? { '#expiresAt': 'expiresAt' } : {}),
        },
        ExpressionAttributeValues: {
          ':by': input.by ?? 1,
          ':itemType': 'kv',
          ...(ttl ? { ':expiresAt': ttl } : {}),
        },
        ReturnValues: 'ALL_NEW',
      }));
      return { value: Number(result.Attributes?.counter ?? 0) };
    },
    async isHealthy() {
      await client.send(new QueryCommand({
        TableName: options.tableName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'PK' },
        ExpressionAttributeValues: { ':pk': '__healthcheck__' },
        Limit: 1,
      }));
      return true;
    },
  };
}

export function dynamoDbIndexedDirectoryStore(
  options: DynamoDbStoreOptions,
): IndexedDirectoryStoreAdapter & ProvisionableStoreAdapter {
  const client = documentClient(options);

  return {
    getProvisioningPlan() {
      return dynamoDbStoreProvisioningPlan(options.tableName);
    },
    async get(key) {
      const result = await client.send(new GetCommand({
        TableName: options.tableName,
        Key: { PK: directoryRecordPk(key), SK: DIRECTORY_RECORD_SORT_KEY },
        ConsistentRead: options.consistentRead,
      }));
      return fromDirectoryItem(result.Item);
    },
    async put(record) {
      const existing = await this.get(record.key);
      await writeDirectoryRecord(client, options.tableName, record, existing);
    },
    async putIfAbsent(record) {
      try {
        await writeDirectoryRecord(client, options.tableName, record, null, 'attribute_not_exists(PK)');
        return { inserted: true };
      } catch (error) {
        if (!isConditionalCheckFailed(error)) throw error;
        const existing = await this.get(record.key);
        return { inserted: false, ...(existing ? { existing } : {}) };
      }
    },
    async update(record) {
      await this.put(record);
      return record;
    },
    async delete(key) {
      const existing = await this.get(key);
      const deletes = existing ? indexEdges(existing).map((edge) => ({
        Delete: {
          TableName: options.tableName,
          Key: { PK: edge.pk, SK: edge.sk },
        },
      })) : [];
      await client.send(new TransactWriteCommand({
        TransactItems: [
          ...deletes,
          {
            Delete: {
              TableName: options.tableName,
              Key: { PK: directoryRecordPk(key), SK: DIRECTORY_RECORD_SORT_KEY },
            },
          },
        ],
      }));
    },
    async query(input) {
      const result = await client.send(new QueryCommand({
        TableName: options.tableName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'PK' },
        ExpressionAttributeValues: { ':pk': directoryIndexPk(input.index, input.value) },
        Limit: input.limit,
        ExclusiveStartKey: input.cursor ? JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) : undefined,
      }));
      const keys = (result.Items ?? [])
        .map((item) => typeof item.dirKey === 'string' ? item.dirKey : null)
        .filter((key): key is string => Boolean(key));
      const records = (
        await Promise.all(keys.map((key) => this.get(key)))
      ).filter((record): record is IndexedDirectoryRecord => Boolean(record));
      return {
        records,
        ...(result.LastEvaluatedKey
          ? { cursor: Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') }
          : {}),
      };
    },
  };
}

export const createDynamoDbAtomicKVStore = dynamoDbAtomicKVStore;
export const createDynamoDbIndexedDirectoryStore = dynamoDbIndexedDirectoryStore;

async function writeDirectoryRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  record: IndexedDirectoryRecord,
  existing: IndexedDirectoryRecord | null,
  conditionExpression?: string,
): Promise<void> {
  const deletes = existing ? indexEdges(existing).map((edge) => ({
    Delete: { TableName: tableName, Key: { PK: edge.pk, SK: edge.sk } },
  })) : [];
  const puts = indexEdges(record).map((edge) => ({
    Put: {
      TableName: tableName,
      Item: {
        PK: edge.pk,
        SK: edge.sk,
        itemType: 'directoryIndex',
        indexName: edge.index,
        indexValue: edge.value,
        dirKey: record.key,
      },
    },
  }));
  await client.send(new TransactWriteCommand({
    TransactItems: [
      ...deletes,
      {
        Put: {
          TableName: tableName,
          Item: toDirectoryItem(record),
          ...(conditionExpression ? { ConditionExpression: conditionExpression } : {}),
        },
      },
      ...puts,
    ],
  }));
}

function documentClient(options: DynamoDbStoreOptions): DynamoDBDocumentClient {
  return options.documentClient
    ?? DynamoDBDocumentClient.from(new DynamoDBClient(options), options.documentClientConfig);
}

function kvItem(key: string, value: string, ttlSeconds?: number): Record<string, unknown> {
  const expiresAt = ttlEpochSeconds(ttlSeconds);
  return {
    PK: kvPk(key),
    SK: KV_SORT_KEY,
    itemType: 'kv',
    value,
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function toDirectoryItem(record: IndexedDirectoryRecord): Record<string, unknown> {
  const expiresAt = ttlEpochSeconds(record.ttlSeconds);
  return {
    PK: directoryRecordPk(record.key),
    SK: DIRECTORY_RECORD_SORT_KEY,
    itemType: 'directoryRecord',
    dirKey: record.key,
    value: record.value,
    indexes: record.indexes ?? {},
    ...(record.ttlSeconds ? { ttlSeconds: record.ttlSeconds } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function fromDirectoryItem(item: Record<string, unknown> | undefined): IndexedDirectoryRecord | null {
  if (!item || isExpired(item.expiresAt)) return null;
  if (typeof item.dirKey !== 'string' || typeof item.value !== 'string') return null;
  return {
    key: item.dirKey,
    value: item.value,
    indexes: isRecord(item.indexes) ? normalizeIndexes(item.indexes) : undefined,
    ttlSeconds: typeof item.ttlSeconds === 'number' ? item.ttlSeconds : undefined,
  };
}

function indexEdges(record: IndexedDirectoryRecord): Array<{
  pk: string;
  sk: string;
  index: string;
  value: string;
}> {
  const edges: Array<{ pk: string; sk: string; index: string; value: string }> = [];
  for (const [index, value] of Object.entries(record.indexes ?? {})) {
    for (const indexValue of normalizeIndexValues(value)) {
      edges.push({
        pk: directoryIndexPk(index, indexValue),
        sk: `R#${record.key}`,
        index,
        value: indexValue,
      });
    }
  }
  return edges;
}

function normalizeIndexes(indexes: Record<string, unknown>): Record<string, string | readonly string[]> {
  const normalized: Record<string, string | readonly string[]> = {};
  for (const [key, value] of Object.entries(indexes)) {
    if (typeof value === 'string') normalized[key] = value;
    if (Array.isArray(value)) normalized[key] = value.filter((entry): entry is string => typeof entry === 'string');
  }
  return normalized;
}

function normalizeIndexValues(value: string | readonly string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((entry) => entry.length > 0);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function ttlEpochSeconds(ttlSeconds: number | undefined): number | undefined {
  return typeof ttlSeconds === 'number' && ttlSeconds > 0
    ? Math.floor(Date.now() / 1000) + Math.floor(ttlSeconds)
    : undefined;
}

function isExpired(value: unknown): boolean {
  return typeof value === 'number' && value <= Math.floor(Date.now() / 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isConditionalCheckFailed(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && (error as { name?: unknown }).name === 'ConditionalCheckFailedException',
  );
}

function kvPk(key: string): string {
  return `KV#${key}`;
}

function directoryRecordPk(key: string): string {
  return `DIR#${key}`;
}

function directoryIndexPk(index: string, value: string): string {
  return `IDX#${index}#${value}`;
}
