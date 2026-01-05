/**
 * Schema version tracking for Superfunctions libraries
 */

import type { Adapter } from '../adapter/types.js';

export interface SchemaVersion {
  namespace: string;
  version: number;
  appliedAt: Date;
}

/**
 * Schema tracker manages schema versions for libraries
 */
export class SchemaTracker {
  private readonly TRACKING_TABLE = '__superfunctions_schema_versions';

  constructor(private adapter: Adapter) {}

  /**
   * Get current schema version for a library
   */
  async getVersion(namespace: string): Promise<number> {
    try {
      const result = await this.adapter.findOne<SchemaVersion>({
        model: this.TRACKING_TABLE,
        where: [{ field: 'namespace', operator: 'eq', value: namespace }],
      });
      return result?.version ?? 0;
    } catch {
      // Table doesn't exist yet or other error
      return 0;
    }
  }

  /**
   * Set schema version for a library
   */
  async setVersion(namespace: string, version: number): Promise<void> {
    try {
      await this.adapter.upsert({
        model: this.TRACKING_TABLE,
        where: [{ field: 'namespace', operator: 'eq', value: namespace }],
        create: {
          namespace,
          version,
          appliedAt: new Date(),
        },
        update: {
          version,
          appliedAt: new Date(),
        },
      });
    } catch (error) {
      throw new Error(`Failed to set schema version: ${error}`);
    }
  }

  /**
   * Get all schema versions
   */
  async getAllVersions(): Promise<SchemaVersion[]> {
    try {
      return await this.adapter.findMany<SchemaVersion>({
        model: this.TRACKING_TABLE,
        where: [],
        orderBy: [{ field: 'namespace', direction: 'asc' }],
      });
    } catch {
      return [];
    }
  }

  /**
   * Initialize tracking table
   * This should be called once during setup
   */
  async initialize(): Promise<void> {
    // The tracking table needs to be created manually or via migrations
    // This is a no-op for now, as table creation is ORM-specific
  }

  /**
   * Check if a library's schema is up to date
   */
  async isUpToDate(namespace: string, requiredVersion: number): Promise<boolean> {
    const currentVersion = await this.getVersion(namespace);
    return currentVersion >= requiredVersion;
  }

  /**
   * Check if a library's schema needs migration
   */
  async needsMigration(namespace: string, requiredVersion: number): Promise<boolean> {
    const currentVersion = await this.getVersion(namespace);
    return currentVersion < requiredVersion;
  }

  /**
   * Get version status for a library
   */
  async getVersionStatus(
    namespace: string,
    requiredVersion: number
  ): Promise<{
    namespace: string;
    current: number;
    required: number;
    status: 'up-to-date' | 'outdated' | 'not-installed' | 'newer';
  }> {
    const current = await this.getVersion(namespace);

    let status: 'up-to-date' | 'outdated' | 'not-installed' | 'newer';
    if (current === 0) {
      status = 'not-installed';
    } else if (current < requiredVersion) {
      status = 'outdated';
    } else if (current > requiredVersion) {
      status = 'newer';
    } else {
      status = 'up-to-date';
    }

    return {
      namespace,
      current,
      required: requiredVersion,
      status,
    };
  }
}

/**
 * Create a schema tracker instance
 */
export function createSchemaTracker(adapter: Adapter): SchemaTracker {
  return new SchemaTracker(adapter);
}
