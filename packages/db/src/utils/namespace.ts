/**
 * Namespace manager for table name isolation
 */

export interface NamespaceConfig {
  enabled: boolean;
  separator: string; // Default: '_'
  prefix?: string; // Global prefix
  schemaSupport?: boolean; // Use database schemas (PostgreSQL)
}

export class NamespaceManager {
  private readonly config: NamespaceConfig;

  constructor(config: NamespaceConfig) {
    this.config = {
      ...config,
      separator: config.separator || "_",
    };
  }

  /**
   * Apply namespace to table name
   *
   * Examples:
   * - apply('authFn', 'email_log') → 'authFn_email_log'
   * - apply('fileFn', 'jobs') → 'fileFn_jobs'
   */
  apply(libraryName: string, tableName: string): string {
    if (!this.config.enabled) {
      return tableName;
    }

    const parts: string[] = [];

    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }

    parts.push(libraryName);
    parts.push(tableName);

    return parts.join(this.config.separator);
  }

  /**
   * Get PostgreSQL schema name
   */
  getSchema(libraryName: string): string | undefined {
    if (!this.config.schemaSupport) {
      return undefined;
    }

    return this.config.prefix
      ? `${this.config.prefix}_${libraryName}`
      : libraryName;
  }

  /**
   * Parse namespaced table name
   */
  parse(namespacedName: string): { namespace?: string; table: string } {
    if (!this.config.enabled) {
      return { table: namespacedName };
    }

    const parts = namespacedName.split(this.config.separator);
    const table = parts.pop()!;
    const namespace = parts.join(this.config.separator);

    return { namespace, table };
  }

  /**
   * Check if namespace is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<NamespaceConfig> {
    return this.config;
  }
}

/**
 * Create a default namespace manager with no namespacing
 */
export function createDefaultNamespaceManager(): NamespaceManager {
  return new NamespaceManager({
    enabled: false,
    separator: "_",
  });
}

/**
 * Create a namespace manager with common configuration
 */
export function createNamespaceManager(
  enabled: boolean,
  options?: Partial<Omit<NamespaceConfig, "enabled">>
): NamespaceManager {
  return new NamespaceManager({
    enabled,
    separator: options?.separator ?? "_",
    prefix: options?.prefix,
    schemaSupport: options?.schemaSupport,
  });
}
