import { DEFAULT_CAPABILITIES } from "@superfunctions/db";
import type {
  Adapter,
  CountParams,
  CreateManyParams,
  CreateParams,
  DeleteManyParams,
  DeleteParams,
  FindManyParams,
  FindOneParams,
  HealthStatus,
  InternalCrud,
  TableSchema,
  TransactionAdapter,
  UpdateManyParams,
  UpdateParams,
  UpsertParams,
  ValidationResult,
  WhereClause,
} from "@superfunctions/db";

type Row = Record<string, any>;
type InternalWhereClauseLike = {
  field: string;
  op: string;
  value: unknown;
};
type Mutation = (adapter: MemoryAdapter) => Promise<void>;

export class MemoryAdapter implements Adapter {
  readonly id = "memory-test";
  readonly name = "Memory Test Adapter";
  readonly version = "0.0.0";
  readonly capabilities = { ...DEFAULT_CAPABILITIES, transactions: { ...DEFAULT_CAPABILITIES.transactions, supported: true, configurableIsolation: true, isolation: ["read_committed", "repeatable_read"] as import("@superfunctions/db").TransactionIsolation[] } };
  readonly internal: InternalCrud;

  private readonly tables = new Map<string, Row[]>();
  private readonly schemaVersions = new Map<string, number>();
  private mutationLog?: Mutation[];

  constructor() {
    this.internal = createInternalCrud(this);
  }

  async create<T = any>(params: CreateParams): Promise<T> {
    const row = clone(params.data);
    this.table(params.model).push(row);
    this.mutationLog?.push(async adapter => { await adapter.create(clone(params)); });
    return clone(row) as T;
  }

  async findOne<T = any>(params: FindOneParams): Promise<T | null> {
    return (await this.findMany<T>({ ...params, limit: 1 }))[0] ?? null;
  }

  async findMany<T = any>(params: FindManyParams): Promise<T[]> {
    let rows = this.table(params.model).filter((row) => matchesWhere(row, params.where ?? []));
    for (const order of [...(params.orderBy ?? [])].reverse()) {
      rows = [...rows].sort((a, b) => compareValues(a[order.field], b[order.field], order.direction));
    }
    const offset = params.offset ?? 0;
    const limit = params.limit ?? rows.length;
    return rows.slice(offset, offset + limit).map((row) => clone(row) as T);
  }

  async update<T = any>(params: UpdateParams): Promise<T> {
    const rows = this.table(params.model);
    const row = rows.find((candidate) => matchesWhere(candidate, params.where));
    if (!row) throw new Error(`Row not found in ${params.model}`);
    Object.assign(row, clone(params.data));
    this.mutationLog?.push(async adapter => { await adapter.update(clone(params)); });
    return clone(row) as T;
  }

  async delete(params: DeleteParams): Promise<void> {
    await this.deleteMany(params);
  }

  async createMany<T = any>(params: CreateManyParams): Promise<T[]> {
    const created: T[] = [];
    for (const data of params.data) {
      created.push(await this.create<T>({ model: params.model, data }));
    }
    return created;
  }

  async updateMany(params: UpdateManyParams): Promise<number> {
    let count = 0;
    for (const row of this.table(params.model)) {
      if (matchesWhere(row, params.where)) {
        Object.assign(row, clone(params.data));
        count++;
      }
    }
    this.mutationLog?.push(async adapter => { await adapter.updateMany(clone(params)); });
    return count;
  }

  async deleteMany(params: DeleteManyParams): Promise<number> {
    const rows = this.table(params.model);
    const kept = rows.filter((row) => !matchesWhere(row, params.where));
    const deleted = rows.length - kept.length;
    this.tables.set(params.model, kept);
    this.mutationLog?.push(async adapter => { await adapter.deleteMany(clone(params)); });
    return deleted;
  }

  async upsert<T = any>(params: UpsertParams): Promise<T> {
    const existing = await this.findOne<T>({ model: params.model, where: params.where });
    if (existing) {
      return this.update<T>({ model: params.model, where: params.where, data: params.update });
    }
    return this.create<T>({ model: params.model, data: params.create });
  }

  async count(params: CountParams): Promise<number> {
    return this.table(params.model).filter((row) => matchesWhere(row, params.where ?? [])).length;
  }

  private transactionTail: Promise<void> = Promise.resolve();
  async transaction<R>(callback: (trx: TransactionAdapter) => Promise<R>, options?: Parameters<Adapter["transaction"]>[1]): Promise<R> {
    if (options && !this.capabilities.transactions.isolation.includes(options.isolationLevel)) {
      throw new Error(`Requested transaction isolation is unsupported: ${options.isolationLevel}`);
    }
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const snapshot = new MemoryAdapter();
    for (const [name, rows] of this.tables) snapshot.tables.set(name, clone(rows));
    for (const [namespace, version] of this.schemaVersions) snapshot.schemaVersions.set(namespace, version);
    snapshot.mutationLog = [];
    const trx = new Proxy(snapshot, {
      get(target, property) {
        if (property === "transaction") return async () => { throw new Error("Nested transactions are unsupported"); };
        if (property === "close") return async () => {};
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as TransactionAdapter;
    try {
      const result = await callback(trx);
      const tablesBeforeCommit = new Map([...this.tables].map(([name, rows]) => [name, clone(rows)]));
      const versionsBeforeCommit = new Map(this.schemaVersions);
      try {
        for (const apply of snapshot.mutationLog) await apply(this);
      } catch (error) {
        this.tables.clear();
        for (const [name, rows] of tablesBeforeCommit) this.tables.set(name, rows);
        this.schemaVersions.clear();
        for (const [namespace, version] of versionsBeforeCommit) this.schemaVersions.set(namespace, version);
        throw error;
      }
      return result;
    } finally { release(); }
  }

  async initialize(): Promise<void> {}

  async isHealthy(): Promise<HealthStatus> {
    return { healthy: true, uptime: 0 };
  }

  async close(): Promise<void> {}

  async getSchemaVersion(namespace: string): Promise<number> {
    return this.schemaVersions.get(namespace) ?? 0;
  }

  async setSchemaVersion(namespace: string, version: number): Promise<void> {
    this.schemaVersions.set(namespace, version);
    this.mutationLog?.push(async adapter => { await adapter.setSchemaVersion(namespace, version); });
  }

  async validateSchema(_schema: TableSchema): Promise<ValidationResult> {
    return { valid: true };
  }

  dump(model: string): Row[] {
    return this.table(model).map(clone);
  }

  private table(model: string): Row[] {
    const existing = this.tables.get(model);
    if (existing) return existing;
    const rows: Row[] = [];
    this.tables.set(model, rows);
    return rows;
  }
}

function createInternalCrud(adapter: MemoryAdapter): InternalCrud {
  const toWhere = (where: InternalWhereClauseLike[]): WhereClause[] =>
    where.map((clause) => ({
      field: clause.field,
      operator: clause.op as WhereClause["operator"],
      value: clause.value,
    }));

  return {
    async ensureTable() {},
    async create(table, data) {
      return adapter.create({ model: table, data });
    },
    async findOne(table, where) {
      return adapter.findOne({ model: table, where: toWhere(where) });
    },
    async findMany(table, where, opts) {
      return adapter.findMany({
        model: table,
        where: toWhere(where),
        orderBy: opts?.orderBy ? [{ field: opts.orderBy, direction: "asc" }] : undefined,
        limit: opts?.limit,
      });
    },
    async update(table, where, data) {
      return adapter.updateMany({ model: table, where: toWhere(where), data });
    },
    async delete(table, where) {
      return adapter.deleteMany({ model: table, where: toWhere(where) });
    },
    async createMany(table, data) {
      return adapter.createMany({ model: table, data });
    },
  };
}

function matchesWhere(row: Row, where: WhereClause[]): boolean {
  return where.every((clause) => matchClause(row[clause.field], clause));
}

function matchClause(value: unknown, clause: WhereClause): boolean {
  const comparable = (item: unknown): any => item instanceof Date ? item.toISOString() : item;
  value = comparable(value);
  const expected = comparable(clause.value);
  switch (clause.operator) {
    case "eq":
      return expected === null ? value == null : value === expected;
    case "ne":
      return expected === null ? value != null : value !== expected;
    case "gt":
      return (value as any) > expected;
    case "gte":
      return (value as any) >= expected;
    case "lt":
      return (value as any) < expected;
    case "lte":
      return (value as any) <= expected;
    case "in":
      return Array.isArray(clause.value) && clause.value.map(comparable).includes(value);
    case "not_in":
      return Array.isArray(clause.value) && !clause.value.map(comparable).includes(value);
    case "contains":
      return String(value).includes(String(expected));
    case "starts_with":
      return String(value).startsWith(String(expected));
    case "ends_with":
      return String(value).endsWith(String(expected));
    default:
      return false;
  }
}

function compareValues(a: unknown, b: unknown, direction: "asc" | "desc"): number {
  const result = String(a ?? "").localeCompare(String(b ?? ""));
  return direction === "asc" ? result : -result;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
