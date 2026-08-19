/**
 * Row-level namespace isolation wrapper for database adapters.
 *
 * Wraps a DatabaseAdapter to automatically inject namespace filtering on reads
 * and stamp namespace on writes, providing tenant/user-level data isolation.
 */

import type {
  Adapter,
  RowLevelNamespaceConfig,
  TransactionAdapter,
  WhereClause,
} from './types.js';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class NamespaceRequiredError extends Error {
  public readonly code = 'NAMESPACE_REQUIRED';

  constructor() {
    super('Row-level namespace is enabled but no namespace was provided');
    this.name = 'NamespaceRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Resolved config (all defaults applied)
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  columnName: string;
  mandatory: boolean;
}

function resolveConfig(config: RowLevelNamespaceConfig): ResolvedConfig {
  const columnName = config.columnName?.trim() ?? '__ns';
  if (!columnName) {
    throw new Error('row-level namespace columnName cannot be blank');
  }

  return {
    columnName,
    mandatory: config.mandatory ?? true,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertNamespace(
  ns: string | undefined | null,
  mandatory: boolean,
): asserts ns is string {
  if (mandatory && (!ns || ns === '')) {
    throw new NamespaceRequiredError();
  }
}

function resolveNamespace(
  ns: string | undefined | null,
  mandatory: boolean,
): string | undefined {
  assertNamespace(ns, mandatory);
  return ns ?? undefined;
}

function namespaceWhereClause(col: string, ns: string): WhereClause {
  return { field: col, operator: 'eq', value: ns };
}

function appendWhere(
  existing: WhereClause[] | undefined,
  clause: WhereClause,
): WhereClause[] {
  return [...(existing ?? []), clause];
}

function withNamespaceWhere(
  where: WhereClause[] | undefined,
  col: string,
  namespace: string | undefined,
): WhereClause[] | undefined {
  if (!namespace) {
    return where;
  }
  return appendWhere(where, namespaceWhereClause(col, namespace));
}

function buildScopedWhere(
  where: WhereClause[] | undefined,
  col: string,
  namespace: string | undefined,
): WhereClause[] {
  return withNamespaceWhere(removeNamespaceWhere(where, col), col, namespace) ?? [];
}

function removeNamespaceWhere(
  where: WhereClause[] | undefined,
  col: string,
): WhereClause[] | undefined {
  return where?.filter((clause) => clause.field !== col);
}

function sanitizeConflictTarget(
  conflictTarget: string | string[] | undefined,
  col: string,
  namespace: string | undefined,
): string | string[] | undefined {
  if (!conflictTarget) {
    return undefined;
  }

  const visibleTargets = (
    Array.isArray(conflictTarget) ? conflictTarget : [conflictTarget]
  ).filter((field) => field !== col);

  if (visibleTargets.length === 0) {
    return undefined;
  }

  const deduped = Array.from(
    new Set(namespace ? [...visibleTargets, col] : visibleTargets),
  );

  if (!Array.isArray(conflictTarget) && !namespace && deduped.length === 1) {
    return deduped[0];
  }

  return deduped;
}

function stripColumn<T>(record: T, col: string): T {
  if (!record || typeof record !== 'object') return record;
  const copy = { ...record } as Record<string, unknown>;
  delete copy[col];
  return copy as T;
}

function stripColumnFromArray<T>(records: T[], col: string): T[] {
  return records.map((r) => stripColumn(r, col));
}

function stampData(
  data: Record<string, any>,
  col: string,
  ns: string | undefined,
): Record<string, any> {
  if (!ns) {
    return data;
  }
  return { ...data, [col]: ns };
}

function removeColumnFromData(
  data: Record<string, any>,
  col: string,
): Record<string, any> {
  if (!(col in data)) return data;
  const copy = { ...data };
  delete copy[col];
  return copy;
}

type NamespaceWrappedSource = Omit<Adapter, 'transaction' | 'close'>;

function createNamespaceWrappedBase(
  adapter: NamespaceWrappedSource,
  config: RowLevelNamespaceConfig,
): NamespaceWrappedSource {
  const { columnName: col, mandatory } = resolveConfig(config);

  return {
    // --- Pass-through metadata ---
    id: adapter.id,
    name: adapter.name,
    version: adapter.version,
    capabilities: adapter.capabilities,

    // --- Pass-through internal (NOT wrapped) ---
    internal: adapter.internal,

    // --- CRUD ---
    async create(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      const data = stampData(removeColumnFromData(params.data, col), col, namespace);
      const result = await adapter.create({ ...params, data });
      return stripColumn(result, col);
    },

    async createMany(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      const data = params.data.map((d) =>
        stampData(removeColumnFromData(d, col), col, namespace),
      );
      const results = await adapter.createMany({ ...params, data });
      return stripColumnFromArray(results, col);
    },

    async findOne(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      const result = await adapter.findOne({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
      });
      return result ? stripColumn(result, col) : null;
    },

    async findMany(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      const results = await adapter.findMany({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
      });
      return stripColumnFromArray(results, col);
    },

    async update(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      if (!params.where || params.where.length === 0) {
        throw new Error('update requires a non-empty where clause; use updateMany to update all rows');
      }
      const data = removeColumnFromData(params.data, col);
      const result = await adapter.update({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
        data,
      });
      return stripColumn(result, col);
    },

    async updateMany(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      const data = removeColumnFromData(params.data, col);
      return adapter.updateMany({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
        data,
      });
    },

    async delete(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      if (!params.where || params.where.length === 0) {
        throw new Error('delete requires a non-empty where clause; use deleteMany to delete all rows');
      }
      return adapter.delete({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
      });
    },

    async deleteMany(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      return adapter.deleteMany({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
      });
    },

    async upsert(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      const create = stampData(removeColumnFromData(params.create, col), col, namespace);
      const update = removeColumnFromData(params.update, col);
      const conflictTarget = sanitizeConflictTarget(
        params.conflictTarget,
        col,
        namespace,
      );
      const result = await adapter.upsert({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
        create,
        update,
        conflictTarget,
      });
      return stripColumn(result, col);
    },

    async count(params) {
      const namespace = resolveNamespace(params.namespace, mandatory);
      return adapter.count({
        ...params,
        where: buildScopedWhere(params.where, col, namespace),
      });
    },

    // --- Lifecycle pass-through ---
    initialize: () => adapter.initialize(),
    isHealthy: () => adapter.isHealthy(),

    // --- Schema management pass-through ---
    getSchemaVersion: (ns) => adapter.getSchemaVersion(ns),
    setSchemaVersion: (ns, v) => adapter.setSchemaVersion(ns, v),
    validateSchema: (s) => adapter.validateSchema(s),

    // Optional schema creation
    createSchema: adapter.createSchema
      ? (params) => adapter.createSchema!(params)
      : undefined,
  };
}

function wrapTransactionAdapter(
  trx: TransactionAdapter,
  config: RowLevelNamespaceConfig,
): TransactionAdapter {
  const wrapped = createNamespaceWrappedBase(trx, config);

  return {
    ...wrapped,
    commit: () => trx.commit(),
    rollback: () => trx.rollback(),
  };
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an Adapter with row-level namespace isolation.
 *
 * When enabled:
 * - Reads: `__ns` WHERE clause is prepended to every query.
 * - Writes: `__ns` is stamped into create data.
 * - Updates: `__ns` is stripped from update data (immutable).
 * - Outputs: `__ns` is stripped from all returned records.
 * - Internal CRUD (`adapter.internal`) is NOT affected.
 */
export function wrapWithRowLevelNamespace(
  adapter: Adapter,
  config: RowLevelNamespaceConfig,
): Adapter {
  if (!config.enabled) return adapter;

  const wrappedBase = createNamespaceWrappedBase(adapter, config);

  const wrapped: Adapter = {
    ...wrappedBase,

    // --- Transaction: wrap child adapter ---
    async transaction(callback) {
      return adapter.transaction(async (trx) => {
        return callback(wrapTransactionAdapter(trx, config));
      });
    },

    close: () => adapter.close(),
  };

  return wrapped;
}
