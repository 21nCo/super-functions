import { Runtime } from '../config/schema.js';

/**
 * Base interface for runtime adapters
 * Each runtime (Node.js, Python, Go, etc.) implements this interface
 */
export interface RuntimeAdapter {
  /**
   * Runtime identifier
   */
  readonly name: Runtime;

  /**
   * Detect if this runtime is used in the project
   * @param cwd Project directory
   * @returns Detection result with confidence score
   */
  detect(cwd: string): Promise<RuntimeDetectionResult>;

  /**
   * Get default configuration for this runtime
   * @param cwd Project directory
   * @returns Partial configuration with smart defaults
   */
  getDefaultConfig(cwd: string): Promise<Partial<RuntimeConfig>>;

  /**
   * Generate server setup script for this runtime
   * @param version Runtime version
   * @param options Additional setup options
   * @returns Shell script content
   */
  generateSetupScript(version: string, options?: SetupOptions): string;

  /**
   * Get process manager command (PM2, systemd, etc.)
   */
  getProcessManager(): ProcessManager;

  /**
   * Validate runtime-specific configuration
   * @param config Runtime configuration
   * @returns Validation errors (empty if valid)
   */
  validateConfig(config: RuntimeConfig): string[];
}

/**
 * Runtime detection result
 */
export interface RuntimeDetectionResult {
  detected: boolean;
  confidence: number; // 0-100
  version?: string;
  framework?: string;
  packageManager?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Runtime configuration
 */
export interface RuntimeConfig {
  name: string;
  runtime: Runtime;
  version: string;
  build?: {
    command: string;
    directory: string;
  };
  start: {
    command: string;
    entry?: string;
  };
  port?: number;
}

/**
 * Server setup options
 */
export interface SetupOptions {
  port?: number;
  environment?: string;
  installRedis?: boolean;
  nodeModulesMode?: 'all' | 'production' | 'none';
}

/**
 * Process manager interface
 */
export interface ProcessManager {
  name: string;
  
  /**
   * Generate start command
   */
  generateStartCommand(config: RuntimeConfig, environment: string): string;
  
  /**
   * Generate reload command (zero-downtime)
   */
  generateReloadCommand(serviceName: string): string;
  
  /**
   * Generate stop command
   */
  generateStopCommand(serviceName: string): string;
  
  /**
   * Generate status command
   */
  generateStatusCommand(serviceName: string): string;
  
  /**
   * Generate logs command
   */
  generateLogsCommand(serviceName: string, lines?: number): string;
}

/**
 * Abstract base class for runtime adapters
 */
export abstract class BaseRuntimeAdapter implements RuntimeAdapter {
  abstract readonly name: Runtime;

  abstract detect(cwd: string): Promise<RuntimeDetectionResult>;
  abstract getDefaultConfig(cwd: string): Promise<Partial<RuntimeConfig>>;
  abstract generateSetupScript(version: string, options?: SetupOptions): string;
  abstract getProcessManager(): ProcessManager;

  validateConfig(config: RuntimeConfig): string[] {
    const errors: string[] = [];

    if (!config.name) {
      errors.push('Application name is required');
    }

    if (!config.start?.command) {
      errors.push('Start command is required');
    }

    return errors;
  }
}
