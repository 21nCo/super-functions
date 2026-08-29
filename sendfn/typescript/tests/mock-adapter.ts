export class StrongMockAdapter {
  id = 'strong-mock';
  name = 'Strong Mock Adapter';
  version = '0.1.0';
  capabilities = {} as any;
  internal = {} as any;
  closeCalls = 0;

  protected store = new Map<string, any[]>();

  records<T = any>(model: string): T[] {
    return [...this.getTable(model)];
  }

  clearModel(model: string): void {
    this.store.set(model, []);
  }

  replaceModel(model: string, records: any[]): void {
    this.store.set(model, [...records]);
  }

  protected getTable(model: string): any[] {
    const table = this.store.get(model);
    if (table) {
      return table;
    }

    const nextTable: any[] = [];
    this.store.set(model, nextTable);
    return nextTable;
  }

  protected matches(item: any, where: any[] = []): boolean {
    return where.every((clause) => {
      const value = item[clause.field];

      switch (clause.operator) {
        case 'eq':
          return value === clause.value;
        case 'ne':
          return value !== clause.value;
        case 'lt':
          return value < clause.value;
        case 'lte':
          return value <= clause.value;
        case 'gt':
          return value > clause.value;
        case 'gte':
          return value >= clause.value;
        case 'in':
          return Array.isArray(clause.value) && clause.value.includes(value);
        default:
          return false;
      }
    });
  }

  protected createUniqueConstraintError(model: string, id: string) {
    const error = new Error(`Duplicate id ${id}`) as Error & {
      code?: string;
      retryable?: boolean;
    };
    error.code = 'SENDFN_UNIQUE_CONSTRAINT';
    error.retryable = false;
    return error;
  }

  async create<T = any>(params: any): Promise<T> {
    const table = this.getTable(params.model);
    const item = { ...params.data };
    if (table.some((record) => record.id === item.id)) {
      throw this.createUniqueConstraintError(params.model, item.id);
    }

    table.push(item);
    return item;
  }

  async findOne<T = any>(params: any): Promise<T | null> {
    return (await this.findMany<T>({ ...params, limit: 1 }))[0] ?? null;
  }

  async findMany<T = any>(params: any): Promise<T[]> {
    const table = [...this.getTable(params.model)].filter((item) => this.matches(item, params.where));

    if (params.orderBy) {
      for (const order of [...params.orderBy].reverse()) {
        const direction = order.direction === 'desc' ? -1 : 1;
        table.sort((left, right) => {
          if (left[order.field] === right[order.field]) {
            return 0;
          }

          return left[order.field] > right[order.field] ? direction : -direction;
        });
      }
    }

    const offset = params.offset ?? 0;
    const limit = params.limit ?? table.length;
    return table.slice(offset, offset + limit);
  }

  async update<T = any>(params: any): Promise<T> {
    const table = this.getTable(params.model);
    const record = table.find((item) => this.matches(item, params.where));
    if (!record) {
      throw new Error('Record not found');
    }

    Object.assign(record, params.data);
    return record;
  }

  async delete(params: any): Promise<void> {
    const table = this.getTable(params.model);
    const nextTable = table.filter((item) => !this.matches(item, params.where));
    this.store.set(params.model, nextTable);
  }

  async createMany<T = any>(params: any): Promise<T[]> {
    const table = this.getTable(params.model);
    const incoming = params.data.map((data: any) => ({ ...data }));
    const ids = new Set<string>();

    for (const item of incoming) {
      if (table.some((record) => record.id === item.id) || ids.has(item.id)) {
        throw this.createUniqueConstraintError(params.model, item.id);
      }
      ids.add(item.id);
    }

    table.push(...incoming);
    return incoming;
  }

  async updateMany(params: any): Promise<number> {
    const table = this.getTable(params.model);
    let count = 0;

    for (const record of table) {
      if (this.matches(record, params.where)) {
        Object.assign(record, params.data);
        count += 1;
      }
    }

    return count;
  }

  async deleteMany(params: any): Promise<number> {
    const table = this.getTable(params.model);
    const kept = table.filter((item) => !this.matches(item, params.where));
    this.store.set(params.model, kept);
    return table.length - kept.length;
  }

  async upsert<T = any>(params: any): Promise<T> {
    const existing = await this.findOne(params);
    if (existing) {
      return this.update({ model: params.model, where: params.where, data: params.update });
    }

    return this.create({ model: params.model, data: params.create });
  }

  async count(params: any): Promise<number> {
    return (await this.findMany(params)).length;
  }

  async transaction<R>(callback: (trx: this) => Promise<R>): Promise<R> {
    return callback(this);
  }

  async initialize(): Promise<void> {}
  async isHealthy(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {
    this.closeCalls += 1;
    this.store.clear();
  }
  async getSchemaVersion(): Promise<number> {
    return 0;
  }
  async setSchemaVersion(): Promise<void> {}
  async validateSchema(): Promise<{ valid: true }> {
    return { valid: true };
  }
}

export class WeakOverwriteMockAdapter extends StrongMockAdapter {
  override async create<T = any>(params: any): Promise<T> {
    const table = this.getTable(params.model);
    const existingIndex = table.findIndex((record) => record.id === params.data.id);
    const item = { ...params.data };

    if (existingIndex >= 0) {
      table[existingIndex] = item;
    } else {
      table.push(item);
    }

    return item;
  }
}

export async function assertTestDoubleFidelity(adapter: { create(params: any): Promise<any> }): Promise<void> {
  await adapter.create({ model: 'email_transactions', data: { id: 'tx-1' } });

  try {
    await adapter.create({ model: 'email_transactions', data: { id: 'tx-1' } });
  } catch (error) {
    if ((error as { code?: string }).code === 'SENDFN_UNIQUE_CONSTRAINT') {
      return;
    }

    throw error;
  }

  const fidelityError = new Error(
    'Test double silently overwrites duplicate primary keys'
  ) as Error & { code?: string };
  fidelityError.code = 'SENDFN_TEST_DOUBLE_FIDELITY';
  throw fidelityError;
}
