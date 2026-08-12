import type { Connection, ConnectionStatus } from '../types/connection.js';
import type { PlugFnOwnerKind } from '../types/runtime.js';
import type { Adapter as DbAdapter } from '@superfunctions/db';
import {
  ensurePlugFnDatabaseAdapter,
  type PlugFnDatabaseStorageAdapter,
} from './adapters/database.js';

/**
 * Connection storage interface
 */
export interface ConnectionStorage {
  create(connection: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Connection>;
  get(id: string): Promise<Connection | null>;
  getByUserAndProvider(userId: string, provider: string): Promise<Connection | null>;
  list(userId: string, provider?: string, status?: ConnectionStatus): Promise<Connection[]>;
  listByOwner(
    ownerKind: PlugFnOwnerKind,
    ownerId: string,
    provider?: string,
    status?: ConnectionStatus
  ): Promise<Connection[]>;
  update(id: string, updates: Partial<Connection>): Promise<Connection>;
  delete(id: string): Promise<void>;
  updateLastUsed(id: string): Promise<void>;
}

/**
 * Connection storage implementation using adapter
 */
export class AdapterConnectionStorage implements ConnectionStorage {
  private readonly adapter: PlugFnDatabaseStorageAdapter;

  constructor(adapter: DbAdapter | PlugFnDatabaseStorageAdapter) {
    this.adapter = ensurePlugFnDatabaseAdapter(adapter);
  }

  async create(connection: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Connection> {
    const id = this.generateId();
    const now = new Date();
    
    const fullConnection: Connection = {
      ...connection,
      id,
      createdAt: now,
      updatedAt: now,
    };
    
    return this.adapter.createConnection(fullConnection);
  }

  async get(id: string): Promise<Connection | null> {
    return this.adapter.getConnection(id);
  }

  async getByUserAndProvider(userId: string, provider: string): Promise<Connection | null> {
    const connections = await this.adapter.listConnections(userId, provider);
    return connections[0] || null;
  }

  async list(userId: string, provider?: string, status?: ConnectionStatus): Promise<Connection[]> {
    const connections = await this.adapter.listConnections(userId, provider);
    
    if (status) {
      return connections.filter((c: Connection) => c.status === status);
    }
    
    return connections;
  }

  async listByOwner(
    ownerKind: PlugFnOwnerKind,
    ownerId: string,
    provider?: string,
    status?: ConnectionStatus
  ): Promise<Connection[]> {
    const where = [
      { field: 'ownerKind', operator: 'eq' as const, value: ownerKind },
      { field: 'ownerId', operator: 'eq' as const, value: ownerId },
      ...(provider
        ? [{ field: 'provider', operator: 'eq' as const, value: provider }]
        : []),
      ...(status
        ? [{ field: 'status', operator: 'eq' as const, value: status }]
        : []),
    ];

    return this.adapter.database.findMany<Connection>({
      model: this.adapter.models.connections,
      where,
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  async update(id: string, updates: Partial<Connection>): Promise<Connection> {
    await this.adapter.updateConnection(id, {
      ...updates,
      updatedAt: new Date(),
    });
    
    const updated = await this.adapter.getConnection(id);
    if (!updated) {
      throw new Error(`Connection ${id} not found after update`);
    }
    
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.adapter.deleteConnection(id);
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.adapter.updateConnection(id, {
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private generateId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
