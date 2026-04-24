import type { Adapter, AdapterCapabilities } from "@superfunctions/db";

const FAKE_DB_CAPABILITIES: AdapterCapabilities = {
  types: {
    json: true,
    dates: true,
    booleans: true,
    bigint: false,
    uuid: false,
    enum: false,
  },
  operations: {
    batch: false,
    upsert: true,
    streaming: false,
    fulltext: false,
    returning: false,
  },
  transactions: { supported: true, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: {
    customIdGeneration: false,
    numericIds: false,
    schemaNamespaces: false,
    customTypes: false,
  },
};

export function createFakeDbAdapter(): Adapter {
  const tables = new Map<string, Map<string, any>>();
  let idCounter = 1;

  function cloneTablesSnapshot(): Map<string, Map<string, any>> {
    return new Map(
      Array.from(tables.entries(), ([tableName, rows]) => [
        tableName,
        new Map(
          Array.from(rows.entries(), ([id, record]) => [id, { ...record }]),
        ),
      ]),
    );
  }

  function getTable(model: string): Map<string, any> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function requireWhere(where: any[] | undefined, operation: string): any[] {
    if (!where || where.length === 0) {
      throw new Error(`fake adapter: ${operation} requires a non-empty where clause`);
    }
    return where;
  }

  function matchesWhere(record: any, where: any[]): boolean {
    if (!where) return true;
    for (const clause of where) {
      const value = record[clause.field];
      const operator = clause.operator ?? clause.op;
      switch (operator) {
        case "eq":
          if (value !== clause.value) return false;
          break;
        case "ne":
          if (value === clause.value) return false;
          break;
        default:
          throw new Error(`Unsupported where operator: ${operator}`);
      }
    }
    return true;
  }

  const internal = {
    async ensureTable() {},
    async create(table: string, data: Record<string, unknown>) {
      const id = String(data.id ?? `internal_${idCounter++}`);
      const record = { ...data, id };
      getTable(table).set(id, record);
      return record;
    },
    async findOne(table: string, where: any[]) {
      for (const record of getTable(table).values()) {
        if (matchesWhere(record, where)) return record;
      }
      return null;
    },
    async findMany(table: string, where: any[], options?: { limit?: number; offset?: number }) {
      const results = Array.from(getTable(table).values()).filter((record) =>
        matchesWhere(record, where)
      );
      const offset = options?.offset ?? 0;
      const end = typeof options?.limit === "number" ? offset + options.limit : undefined;
      return results.slice(offset, end);
    },
    async update(table: string, where: any[], data: Record<string, unknown>) {
      const tableRecords = getTable(table);
      let count = 0;
      for (const [id, record] of tableRecords.entries()) {
        if (matchesWhere(record, where)) {
          tableRecords.set(id, { ...record, ...data });
          count++;
        }
      }
      if (count === 0) {
        throw new Error(`Record not found in ${table}`);
      }
      return count;
    },
    async delete(table: string, where: any[]) {
      let count = 0;
      for (const [id, record] of getTable(table).entries()) {
        if (matchesWhere(record, where)) {
          getTable(table).delete(id);
          count++;
        }
      }
      return count;
    },
  };

  return {
    id: "fake",
    name: "fake",
    version: "1.0.0",
    capabilities: FAKE_DB_CAPABILITIES,
    async create(params: any) {
      const table = getTable(params.model);
      const id = String(
        params.data.id ??
          params.data.uploadSessionId ??
          params.data.versionId ??
          params.data.fileId ??
          params.data.permissionId ??
          `id_${idCounter++}`
      );
      const record = { ...params.data, id, _id: id };
      table.set(id, record);
      return record;
    },
    async findOne(params: any) {
      const table = getTable(params.model);
      for (const record of table.values()) {
        if (matchesWhere(record, params.where)) return record;
      }
      return null;
    },
    async findMany(params: any) {
      const table = getTable(params.model);
      const results: any[] = [];
      for (const record of table.values()) {
        if (
          !params.where ||
          params.where.length === 0 ||
          matchesWhere(record, params.where)
        ) {
          results.push(record);
        }
      }
      if (
        params.orderBy?.some(
          (o: any) => o.field === "createdAt" && o.direction === "desc",
        )
      ) {
        results.sort((a, b) => {
          const da = new Date(a.createdAt).getTime();
          const db = new Date(b.createdAt).getTime();
          return db - da;
        });
      }
      const offset = params.offset ?? 0;
      const end =
        typeof params.limit === "number" ? offset + params.limit : results.length;
      return results.slice(offset, end);
    },
    async update(params: any) {
      const where = requireWhere(params.where, "update");
      const table = getTable(params.model);
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, where)) {
          const updated = { ...record, ...params.data };
          table.set(id, updated);
          return updated;
        }
      }
      throw new Error(`Record not found for model ${params.model}`);
    },
    async delete(params: any) {
      const where = requireWhere(params.where, "delete");
      const table = getTable(params.model);
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, where)) {
          table.delete(id);
          return;
        }
      }
    },
    async createMany(this: any, params: any) {
      const created = [];
      for (const data of params.data) {
        created.push(await this.create({ ...params, data }));
      }
      return created;
    },
    async updateMany(params: any) {
      const table = getTable(params.model);
      let count = 0;
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, params.where)) {
          table.set(id, { ...record, ...params.data });
          count++;
        }
      }
      return count;
    },
    async deleteMany(params: any) {
      const table = getTable(params.model);
      let count = 0;
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, params.where)) {
          table.delete(id);
          count++;
        }
      }
      return count;
    },
    async upsert(this: any, params: any) {
      const existing = await this.findOne({
        model: params.model,
        where: params.where,
        namespace: params.namespace,
      });
      if (existing) {
        return await this.update({
          model: params.model,
          where: params.where,
          data: params.update,
          namespace: params.namespace,
        });
      }
      return await this.create({
        model: params.model,
        data: params.create,
        namespace: params.namespace,
      });
    },
    async count(params: any) {
      const table = getTable(params.model);
      let count = 0;
      for (const record of table.values()) {
        if (matchesWhere(record, params.where)) {
          count++;
        }
      }
      return count;
    },
    async transaction(callback: any) {
      const snapshot = cloneTablesSnapshot();
      const snapshotIdCounter = idCounter;

      try {
        return await callback(this as any);
      } catch (error) {
        tables.clear();
        for (const [tableName, rows] of snapshot.entries()) {
          tables.set(tableName, new Map(rows));
        }
        idCounter = snapshotIdCounter;
        throw error;
      }
    },
    async initialize() {},
    async isHealthy() {
      return { healthy: true, uptime: 0 };
    },
    async close() {},
    async getSchemaVersion() {
      return 0;
    },
    async setSchemaVersion() {},
    async validateSchema() {
      return { valid: true };
    },
    internal,
  };
}
