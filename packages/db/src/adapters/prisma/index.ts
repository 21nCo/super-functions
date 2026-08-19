/**
 * Prisma adapter (minimal stub implementation)
 *
 * This is a placeholder demonstrating the adapter pattern for Prisma.
 * A full implementation would map Prisma client methods to the Adapter interface.
 */

import type {
  Adapter,
  AdapterSchemaInput,
  AdapterImplementation,
  CreateParams,
  FindOneParams,
  FindManyParams,
  UpdateParams,
  DeleteParams,
  CreateManyParams,
  UpdateManyParams,
  DeleteManyParams,
  UpsertParams,
  CountParams,
  WhereClause,
  OrderBy,
} from '../../adapter/types.js';
import { createAdapterFactory } from '../../adapter/factory.js';
import { NotFoundError, OperationNotSupportedError } from '../../adapter/errors.js';
import { createPrismaInternalCrud } from './internal.js';
import type { PrismaProvider } from './internal.js';
import { normalizeAdapterSchema } from '../../adapter/schema-codecs.js';

export interface PrismaAdapterConfig {
  prisma: any; // PrismaClient instance
  provider?: PrismaProvider;
  modelMap: Record<string, string>; // model name -> Prisma model name (e.g., 'users' -> 'user')
  /**
   * @deprecated Function authors should wrap incoming adapters with
   * `wrapWithSchema(adapter, getSchema(...))` inside their create/init function.
   * This option remains for compatibility and app-level direct adapter usage.
   */
  adapterSchema?: AdapterSchemaInput;
  schemaVersionsTable?: string; // optional model name for schema versions
  namespace?: any;
  debug?: boolean;
}

/**
 * Build Prisma where clause from generic WhereClause array
 */
function buildPrismaWhere(where: WhereClause[]): any {
  if (!where || where.length === 0) return {};

  const conditions = where.map((clause) => {
    const { field, operator, value } = clause;

    switch (operator) {
      case 'eq':
        return { [field]: value };
      case 'ne':
        return { [field]: { not: value } };
      case 'gt':
        return { [field]: { gt: value } };
      case 'gte':
        return { [field]: { gte: value } };
      case 'lt':
        return { [field]: { lt: value } };
      case 'lte':
        return { [field]: { lte: value } };
      case 'in':
        return { [field]: { in: Array.isArray(value) ? value : [value] } };
      case 'not_in':
        return { [field]: { notIn: Array.isArray(value) ? value : [value] } };
      case 'contains':
        return { [field]: { contains: value } };
      case 'starts_with':
        return { [field]: { startsWith: value } };
      case 'ends_with':
        return { [field]: { endsWith: value } };
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  });

  // Combine with AND/OR based on each clause's connector.
  //
  // The connector on clause i joins the running combination with clause i
  // (left-associative), matching the Drizzle/Kysely adapters. Previously the
  // presence of any OR connector caused every clause to be flattened into a
  // single AND, silently dropping the OR semantics and returning wrong rows.
  if (conditions.length === 1) return conditions[0];

  let combined: any = conditions[0];
  for (let i = 1; i < conditions.length; i++) {
    const connector = where[i]?.connector ?? 'AND';
    combined = connector === 'OR' ? { OR: [combined, conditions[i]] } : { AND: [combined, conditions[i]] };
  }
  return combined;
}

/**
 * Build Prisma orderBy from generic OrderBy array
 */
function buildPrismaOrderBy(orderBy?: OrderBy[]): any {
  if (!orderBy || orderBy.length === 0) return undefined;
  if (orderBy.length === 1) {
    return { [orderBy[0].field]: orderBy[0].direction };
  }
  return orderBy.map((o) => ({ [o.field]: o.direction }));
}

/**
 * Build Prisma select from field list
 */
function buildPrismaSelect(select?: string[]): any {
  if (!select || select.length === 0) return undefined;
  return Object.fromEntries(select.map((f) => [f, true]));
}

export function prismaAdapter(config: PrismaAdapterConfig): Adapter {
  if (!config?.prisma) throw new Error('prismaAdapter: config.prisma is required');
  if (!config?.modelMap) throw new Error('prismaAdapter: config.modelMap is required');

  const createImpl = (_ctx: any): AdapterImplementation => {
    const { prisma, modelMap, schemaVersionsTable } = config;

    const resolveModel = (model: string): any => {
      const prismaModel = modelMap[model];
      if (!prismaModel) throw new Error(`Prisma adapter: no model mapping for "${model}"`);
      return (prisma as any)[prismaModel];
    };

    return {
      async create<T = any>({ model, data, select }: CreateParams): Promise<T> {
        const m = resolveModel(model);
        const prismaSelect = buildPrismaSelect(select);
        return await m.create({ data, select: prismaSelect });
      },

      async findOne<T = any>({ model, where, select }: FindOneParams): Promise<T | null> {
        const m = resolveModel(model);
        const prismaWhere = buildPrismaWhere(where);
        const prismaSelect = buildPrismaSelect(select);
        return await m.findFirst({ where: prismaWhere, select: prismaSelect });
      },

      async findMany<T = any>({ model, where, select, orderBy, limit, offset }: FindManyParams): Promise<T[]> {
        const m = resolveModel(model);
        const prismaWhere = buildPrismaWhere(where ?? []);
        const prismaSelect = buildPrismaSelect(select);
        const prismaOrderBy = buildPrismaOrderBy(orderBy);
        return await m.findMany({
          where: prismaWhere,
          select: prismaSelect,
          orderBy: prismaOrderBy,
          take: limit,
          skip: offset,
        });
      },

      /**
       * Update a single record matching the where clause.
       * 
       * @important This method uses updateMany followed by findFirst, which can have race conditions
       * when the where clause is not unique:
       * - Another process may modify or delete rows between updateMany and findFirst
       * - findFirst may return a different row than what was actually updated
       * 
       * For atomic/consistent updates, wrap this call in adapter.transaction().
       * 
       * Note: Current codebase usages typically use unique id equality and are therefore safe.
       * 
       * @param {UpdateParams} params - Update parameters including model, where, data, and select
       * @returns {Promise<T>} The updated record
       * @throws {Error} If no rows were updated
       */
      async update<T = any>({ model, where, data, select }: UpdateParams): Promise<T> {
        if (!where || where.length === 0) {
          throw new Error('update requires a non-empty where clause; use updateMany to update all rows');
        }
        const m = resolveModel(model);
        const prismaWhere = buildPrismaWhere(where);
        const prismaSelect = buildPrismaSelect(select);
        // Note: Prisma update requires unique where, but we use updateMany + findFirst for flexibility
        const updateResult = await m.updateMany({ where: prismaWhere, data });
        if (!updateResult || Number(updateResult.count ?? 0) === 0) {
          throw new NotFoundError(model, where);
        }
        const updated = await m.findFirst({ where: prismaWhere, select: prismaSelect });
        if (!updated) throw new NotFoundError(model, where);
        return updated;
      },

      async delete({ model, where }: DeleteParams): Promise<void> {
        if (!where || where.length === 0) {
          throw new Error('delete requires a non-empty where clause; use deleteMany to delete all rows');
        }
        const m = resolveModel(model);
        const prismaWhere = buildPrismaWhere(where);
        // Use deleteMany to support complex where clauses
        await m.deleteMany({ where: prismaWhere });
      },

      /**
       * Create multiple records in batch.
       * 
       * @important Prisma's createMany does not return created records with DB-generated values.
       * This method returns the input data as-is, which means:
       * - Auto-generated IDs will NOT be included
       * - Database default values will NOT be included
       * - Computed columns will NOT be included
       * 
       * If you need the created records with DB-generated values, use individual create() calls
       * or query the records after creation using unique keys.
       */
      async createMany<T = any>({ model, data }: CreateManyParams): Promise<T[]> {
        const m = resolveModel(model);
        await m.createMany({ data });
        // Prisma createMany doesn't return records; fallback to input data
        return data as T[];
      },

      async updateMany({ model, where, data }: UpdateManyParams): Promise<number> {
        const m = resolveModel(model);
        const prismaWhere = buildPrismaWhere(where ?? []);
        const result = await m.updateMany({ where: prismaWhere, data });
        return result.count ?? 0;
      },

      async deleteMany({ model, where }: DeleteManyParams): Promise<number> {
        const m = resolveModel(model);
        const prismaWhere = buildPrismaWhere(where ?? []);
        const result = await m.deleteMany({ where: prismaWhere });
        return result.count ?? 0;
      },

      async upsert<T = any>({ model, where, create, update, select }: UpsertParams): Promise<T> {
        const m = resolveModel(model);
        // Prisma upsert requires unique where; use first clause
        const prismaWhere = where.length > 0 ? { [where[0].field]: where[0].value } : {};
        const prismaSelect = buildPrismaSelect(select);
        return await m.upsert({ where: prismaWhere, create, update, select: prismaSelect });
      },

      async count({ model, where }: CountParams): Promise<number> {
        const m = resolveModel(model);
        const prismaWhere = buildPrismaWhere(where ?? []);
        return await m.count({ where: prismaWhere });
      },

      async transaction<R>(fn: (trx: any) => Promise<R>): Promise<R> {
        return await prisma.$transaction(async (tx: any) => {
          const child = prismaAdapter({ ...config, prisma: tx });
          return await fn(child);
        });
      },

      async initialize(): Promise<void> {
        await prisma.$connect();
      },

      async isHealthy() {
        try {
          await prisma.$queryRaw`SELECT 1`;
          return { healthy: true, uptime: 0 };
        } catch {
          return { healthy: false, uptime: 0 };
        }
      },

      async close(): Promise<void> {
        await prisma.$disconnect();
      },

      async getSchemaVersion(namespace: string): Promise<number> {
        if (!schemaVersionsTable) return 0;
        const m = (prisma as any)[schemaVersionsTable];
        if (!m) return 0;  // Model not configured

        try {
          const record = await m.findFirst({ where: { namespace } });
          return record?.version ?? 0;
        } catch (error: any) {
          // Check if error is due to table not existing
          // Prisma error code P2021 = table does not exist
          if (error.code === 'P2021') {
            return 0;
          }
          // For other errors (DB connectivity, etc.), log and rethrow
          console.error(`Error getting schema version for namespace "${namespace}":`, error.message);
          throw error;
        }
      },

      async setSchemaVersion(namespace: string, version: number): Promise<void> {
        if (!schemaVersionsTable) {
          throw new OperationNotSupportedError('setSchemaVersion', 'PrismaAdapter (schemaVersionsTable not configured)');
        }
        const m = (prisma as any)[schemaVersionsTable];
        if (!m) throw new Error('Schema versions table model not found');
        await m.upsert({
          where: { namespace },
          create: { namespace, version, appliedAt: new Date() },
          update: { version, appliedAt: new Date() },
        });
      },

      async validateSchema(): Promise<{ valid: boolean; errors?: string[] }> {
        return { valid: true };
      },
    };
  };

  const factory = createAdapterFactory({
    config: {
      adapterId: 'prisma',
      adapterName: 'Prisma Adapter',
      debug: config.debug ?? false,
      namespace: config.namespace,
      capabilities: {
        types: { json: true, dates: true, booleans: true, bigint: true, uuid: true, enum: true },
        operations: { batch: true, upsert: true, streaming: false, fulltext: false, returning: false, strictUpdateNotFound: true },
        transactions: { supported: true, nested: false, isolation: undefined },
        performance: { supportsJoins: true, supportsPreparedStatements: true },
        schema: { migrations: true, constraints: true, indexes: true },
        advanced: { customIdGeneration: false, numericIds: true, schemaNamespaces: false, customTypes: true },
      },
    },
    adapter: createImpl,
  });

  const adapter = factory({
    schema: normalizeAdapterSchema(config.adapterSchema),
  });
  const internalCrud = createPrismaInternalCrud(config.prisma, config.provider);
  return Object.assign(adapter, { internal: internalCrud });
}
