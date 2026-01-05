/**
 * Mock adapter for testing with call tracking
 */

import { DEFAULT_CAPABILITIES } from '../adapter/capabilities.js';
import { OperationNotSupportedError } from '../adapter/errors.js';
import type {
  Adapter,
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
  TransactionAdapter,
  TableSchema,
  ValidationResult,
  HealthStatus,
} from '../adapter/types.js';

export interface MockCall {
  method: string;
  params: any;
  timestamp: Date;
}

/**
 * Mock adapter for testing
 * Records all method calls and allows inspection
 */
export class MockAdapter implements Adapter {
  public calls: MockCall[] = [];
  private responses: Map<string, any> = new Map();
  private errors: Map<string, Error> = new Map();

  readonly id = 'mock';
  readonly name = 'Mock Adapter';
  readonly version = '1.0.0';
  readonly capabilities = DEFAULT_CAPABILITIES;

  /**
   * Set a mock response for a specific method
   */
  setResponse(method: string, response: any): void {
    this.responses.set(method, response);
  }

  /**
   * Set an error to throw for a specific method
   */
  setError(method: string, error: Error): void {
    this.errors.set(method, error);
  }

  /**
   * Record a method call
   */
  private recordCall(method: string, params: any): void {
    this.calls.push({
      method,
      params,
      timestamp: new Date(),
    });
  }

  /**
   * Get a mock response or throw error if configured
   */
  private getResponse<T>(method: string, defaultValue?: T): T {
    if (this.errors.has(method)) {
      throw this.errors.get(method);
    }
    if (this.responses.has(method)) {
      return this.responses.get(method) as T;
    }
    return defaultValue as T;
  }

  // CRUD operations
  async create<T = any>(params: CreateParams): Promise<T> {
    this.recordCall('create', params);
    return this.getResponse<T>('create', { id: 'mock-id', ...params.data } as T);
  }

  async findOne<T = any>(params: FindOneParams): Promise<T | null> {
    this.recordCall('findOne', params);
    return this.getResponse<T | null>('findOne', null);
  }

  async findMany<T = any>(params: FindManyParams): Promise<T[]> {
    this.recordCall('findMany', params);
    return this.getResponse<T[]>('findMany', []);
  }

  async update<T = any>(params: UpdateParams): Promise<T> {
    this.recordCall('update', params);
    return this.getResponse<T>('update', { ...params.data } as T);
  }

  async delete(params: DeleteParams): Promise<void> {
    this.recordCall('delete', params);
    this.getResponse('delete', undefined);
  }

  // Batch operations
  async createMany<T = any>(params: CreateManyParams): Promise<T[]> {
    this.recordCall('createMany', params);
    return this.getResponse<T[]>(
      'createMany',
      params.data.map((d, i) => ({ id: `mock-id-${i}`, ...d })) as T[]
    );
  }

  async updateMany(params: UpdateManyParams): Promise<number> {
    this.recordCall('updateMany', params);
    return this.getResponse<number>('updateMany', 0);
  }

  async deleteMany(params: DeleteManyParams): Promise<number> {
    this.recordCall('deleteMany', params);
    return this.getResponse<number>('deleteMany', 0);
  }

  // Advanced operations
  async upsert<T = any>(params: UpsertParams): Promise<T> {
    this.recordCall('upsert', params);
    return this.getResponse<T>('upsert', { id: 'mock-id', ...params.create } as T);
  }

  async count(params: CountParams): Promise<number> {
    this.recordCall('count', params);
    return this.getResponse<number>('count', 0);
  }

  // Transaction support
  async transaction<R>(_callback: (trx: TransactionAdapter) => Promise<R>): Promise<R> {
    this.recordCall('transaction', {});
    throw new OperationNotSupportedError('transaction', 'Mock Adapter');
  }

  // Lifecycle
  async initialize(): Promise<void> {
    this.recordCall('initialize', {});
  }

  async isHealthy(): Promise<HealthStatus> {
    this.recordCall('isHealthy', {});
    return this.getResponse<HealthStatus>('isHealthy', {
      healthy: true,
      uptime: 0,
    });
  }

  async close(): Promise<void> {
    this.recordCall('close', {});
  }

  // Schema management
  async getSchemaVersion(namespace: string): Promise<number> {
    this.recordCall('getSchemaVersion', { namespace });
    return this.getResponse<number>('getSchemaVersion', 0);
  }

  async setSchemaVersion(namespace: string, version: number): Promise<void> {
    this.recordCall('setSchemaVersion', { namespace, version });
  }

  async validateSchema(_schema: TableSchema): Promise<ValidationResult> {
    this.recordCall('validateSchema', { schema: _schema });
    return this.getResponse<ValidationResult>('validateSchema', { valid: true });
  }

  // Test helpers
  /**
   * Get all calls for a specific method
   */
  getCalls(method?: string): MockCall[] {
    return method ? this.calls.filter((c) => c.method === method) : this.calls;
  }

  /**
   * Get the last call for a specific method
   */
  getLastCall(method: string): MockCall | undefined {
    const calls = this.getCalls(method);
    return calls[calls.length - 1];
  }

  /**
   * Check if a method was called
   */
  wasCalled(method: string): boolean {
    return this.calls.some((c) => c.method === method);
  }

  /**
   * Check how many times a method was called
   */
  getCallCount(method?: string): number {
    return this.getCalls(method).length;
  }

  /**
   * Clear all recorded calls
   */
  clearCalls(): void {
    this.calls = [];
  }

  /**
   * Clear all mock responses and errors
   */
  clearMocks(): void {
    this.responses.clear();
    this.errors.clear();
  }

  /**
   * Reset the mock adapter completely
   */
  reset(): void {
    this.clearCalls();
    this.clearMocks();
  }

  /**
   * Verify that a method was called with specific parameters
   */
  verifyCall(method: string, params?: Partial<any>): boolean {
    const calls = this.getCalls(method);
    if (calls.length === 0) return false;
    if (!params) return true;

    return calls.some((call) => {
      for (const [key, value] of Object.entries(params)) {
        if (JSON.stringify(call.params[key]) !== JSON.stringify(value)) {
          return false;
        }
      }
      return true;
    });
  }
}

/**
 * Create a mock adapter instance
 */
export function createMockAdapter(): MockAdapter {
  return new MockAdapter();
}
