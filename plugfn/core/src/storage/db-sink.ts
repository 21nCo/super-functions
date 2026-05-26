import type { Adapter as DbAdapter, WhereClause } from '@superfunctions/db';
import type { PlugFnPersistenceSink, PlugFnSinkContext } from '../types/runtime.js';

export interface CreateDbSinkOptions<Raw = unknown, RecordValue extends Record<string, unknown> = Record<string, unknown>> {
  adapter: DbAdapter;
  id: string;
  provider: string;
  resource: string;
  model: string;
  uniqueBy: Array<keyof RecordValue & string>;
  transform(raw: Raw, context: PlugFnSinkContext): Promise<RecordValue> | RecordValue;
  delete?(raw: Raw, context: PlugFnSinkContext): Promise<void>;
}

export function createDbSink<
  Raw = unknown,
  RecordValue extends Record<string, unknown> = Record<string, unknown>,
>(options: CreateDbSinkOptions<Raw, RecordValue>): PlugFnPersistenceSink<Raw, RecordValue> {
  return {
    id: options.id,
    provider: options.provider,
    resource: options.resource,
    idempotencyKey(raw, context) {
      const record = options.transform(raw, context);
      if (record instanceof Promise) {
        throw new Error('createDbSink idempotencyKey requires a synchronous transform');
      }
      return buildIdempotencyKey(record, options.uniqueBy);
    },
    idempotencyKeyForRecord(record) {
      return buildIdempotencyKey(record as Record<string, unknown>, options.uniqueBy);
    },
    transform: options.transform,
    async upsert(record) {
      const where = toWhereClauses(record, options.uniqueBy);
      await options.adapter.upsert({
        model: options.model,
        where,
        create: record,
        update: record,
        conflictTarget: [...options.uniqueBy],
      });
    },
    delete: options.delete,
  };
}

function buildIdempotencyKey(
  record: Record<string, unknown>,
  uniqueBy: string[]
): string {
  return uniqueBy.map((field) => `${field}:${String(record[field] ?? '')}`).join('|');
}

function toWhereClauses(
  record: Record<string, unknown>,
  uniqueBy: string[]
): WhereClause[] {
  return uniqueBy.map((field) => ({
    field,
    operator: 'eq',
    value: record[field],
  }));
}
