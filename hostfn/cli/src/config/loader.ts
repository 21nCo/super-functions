import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { HostfnConfig, HostfnConfigSchema } from './schema.js';

export class ConfigLoader {
  private static CONFIG_FILENAME = 'hostfn.config.json';

  /**
   * Load configuration from file
   */
  static load(cwd: string = process.cwd()): HostfnConfig {
    const configPath = resolve(cwd, this.CONFIG_FILENAME);

    if (!existsSync(configPath)) {
      throw new Error(
        `Configuration file not found: ${configPath}\n` +
        `Run 'hostfn init' to create one.`
      );
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const json = JSON.parse(content);
      return this.validate(json);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in config file: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate configuration against schema
   */
  static validate(config: unknown): HostfnConfig {
    const result = HostfnConfigSchema.safeParse(config);

    if (!result.success) {
      const errors = result.error.issues
        .map(err => `  - ${err.path.join('.')}: ${err.message}`)
        .join('\n');
      
      throw new Error(
        `Invalid configuration:\n${errors}`
      );
    }

    return result.data;
  }

  /**
   * Check if config file exists
   */
  static exists(cwd: string = process.cwd()): boolean {
    const configPath = resolve(cwd, this.CONFIG_FILENAME);
    return existsSync(configPath);
  }

  /**
   * Get config file path
   */
  static getConfigPath(cwd: string = process.cwd()): string {
    return resolve(cwd, this.CONFIG_FILENAME);
  }
}
