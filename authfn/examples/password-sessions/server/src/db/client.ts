import type { Adapter } from '@superfunctions/db';
import { drizzleAdapter } from '@superfunctions/db/adapters';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from './generated/authfn-schema.js';
import { passwordSessionsSchema } from '../auth.js';

const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/authfn_examples';

const dateFieldsByModel = new Map<string, string[]>(
  passwordSessionsSchema.schemas.map((table) => [
    table.modelName,
    Object.entries(table.fields)
      .filter(([, field]) => field.type === 'date')
      .map(([fieldName]) => fieldName)
  ])
);

export interface PasswordSessionsDatabase {
  adapter: Adapter;
  db: ReturnType<typeof drizzle>;
  sql: postgres.Sql;
  close(): Promise<void>;
}

export function createPasswordSessionsDatabase(
  databaseUrl: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
): PasswordSessionsDatabase {
  const sql = postgres(databaseUrl, {
    max: 1
  });
  const db = drizzle(sql, {
    schema: authSchema
  });
  const adapter = wrapDateFields(
    drizzleAdapter({
      db,
      dialect: 'postgres'
    })
  );

  return {
    adapter,
    db,
    sql,
    close: async () => {
      await sql.end({
        timeout: 1
      });
    }
  };
}

function wrapDateFields(adapter: Adapter): Adapter {
  return {
    ...adapter,
    create: async (params) =>
      coerceRecord(
        params.model,
        await adapter.create({
          ...params,
          data: serializeRecord(params.model, params.data)
        })
      ),
    createMany: async (params) =>
      coerceRecords(
        params.model,
        await adapter.createMany({
          ...params,
          data: params.data.map((record) => serializeRecord(params.model, record))
        })
      ),
    findOne: async (params) => {
      const value = await adapter.findOne(params);
      return value ? coerceRecord(params.model, value) : null;
    },
    findMany: async (params) => coerceRecords(params.model, await adapter.findMany(params)),
    update: async (params) =>
      coerceRecord(
        params.model,
        await adapter.update({
          ...params,
          data: serializeRecord(params.model, params.data)
        })
      ),
    updateMany: async (params) =>
      adapter.updateMany({
        ...params,
        data: serializeRecord(params.model, params.data)
      }),
    upsert: async (params) =>
      coerceRecord(
        params.model,
        await adapter.upsert({
          ...params,
          create: serializeRecord(params.model, params.create),
          update: serializeRecord(params.model, params.update)
        })
      )
  };
}

function coerceRecords<T>(model: string, records: T[]): T[] {
  return records.map((record) => coerceRecord(model, record));
}

function serializeRecord<T>(model: string, record: T): T {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const dateFields = dateFieldsByModel.get(model);
  if (!dateFields || dateFields.length === 0) {
    return record;
  }

  const nextRecord = {
    ...(record as Record<string, unknown>)
  };

  for (const fieldName of dateFields) {
    const value = nextRecord[fieldName];
    if (value instanceof Date) {
      nextRecord[fieldName] = value.toISOString();
    }
  }

  return nextRecord as T;
}

function coerceRecord<T>(model: string, record: T): T {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const dateFields = dateFieldsByModel.get(model);
  if (!dateFields || dateFields.length === 0) {
    return record;
  }

  const nextRecord = {
    ...(record as Record<string, unknown>)
  };

  for (const fieldName of dateFields) {
    const value = nextRecord[fieldName];
    if (typeof value === 'string' || typeof value === 'number') {
      nextRecord[fieldName] = new Date(value);
    }
  }

  return nextRecord as T;
}
