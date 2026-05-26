import type { Logger } from '../types/action.js';

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private prefix = '[PlugFn]') {}

  debug(message: string, meta?: any): void {
    console.debug(`${this.prefix} DEBUG:`, message, meta || '');
  }

  info(message: string, meta?: any): void {
    console.info(`${this.prefix} INFO:`, message, meta || '');
  }

  warn(message: string, meta?: any): void {
    console.warn(`${this.prefix} WARN:`, message, meta || '');
  }

  error(message: string, meta?: any): void {
    console.error(`${this.prefix} ERROR:`, message, meta || '');
  }
}

/**
 * No-op logger that doesn't output anything
 */
export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Create a logger with a specific prefix
 */
export function createLogger(prefix: string): Logger {
  return new ConsoleLogger(prefix);
}

