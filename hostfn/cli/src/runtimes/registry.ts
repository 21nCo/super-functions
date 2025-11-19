import { Runtime } from '../config/schema.js';
import { RuntimeAdapter } from './base.js';

/**
 * Runtime adapter registry
 * Manages all available runtime adapters
 */
export class RuntimeRegistry {
  private static adapters = new Map<Runtime, RuntimeAdapter>();

  /**
   * Register a runtime adapter
   */
  static register(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get runtime adapter by name
   */
  static get(runtime: Runtime): RuntimeAdapter {
    const adapter = this.adapters.get(runtime);
    if (!adapter) {
      throw new Error(
        `Runtime adapter not found: ${runtime}\n` +
        `Available runtimes: ${Array.from(this.adapters.keys()).join(', ')}`
      );
    }
    return adapter;
  }

  /**
   * Get all registered adapters
   */
  static getAll(): RuntimeAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if runtime is supported
   */
  static has(runtime: Runtime): boolean {
    return this.adapters.has(runtime);
  }

  /**
   * Auto-detect runtime in project directory
   */
  static async detect(cwd: string): Promise<{
    runtime: Runtime;
    adapter: RuntimeAdapter;
    confidence: number;
  } | null> {
    const results = await Promise.all(
      Array.from(this.adapters.values()).map(async (adapter) => {
        const result = await adapter.detect(cwd);
        return {
          runtime: adapter.name,
          adapter,
          ...result,
        };
      })
    );

    // Sort by confidence and get the best match
    const sorted = results
      .filter(r => r.detected)
      .sort((a, b) => b.confidence - a.confidence);

    if (sorted.length === 0) {
      return null;
    }

    return sorted[0];
  }
}
