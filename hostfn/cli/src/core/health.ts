import { Logger } from '../utils/logger.js';

export interface HealthCheckOptions {
  url: string;
  timeout?: number;
  retries?: number;
  interval?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}

/**
 * Health check utility
 */
export class HealthCheck {
  /**
   * Check if service is healthy
   */
  static async check(options: HealthCheckOptions): Promise<HealthCheckResult> {
    const timeout = options.timeout || 5000;

    try {
      const startTime = Date.now();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(options.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'hostfn-health-check',
        },
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;

      return {
        healthy: response.ok,
        statusCode: response.status,
        responseTime,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Poll health endpoint until healthy or max retries reached
   */
  static async poll(options: HealthCheckOptions): Promise<boolean> {
    const retries = options.retries || 10;
    const interval = options.interval || 3000;

    for (let i = 0; i < retries; i++) {
      const result = await this.check(options);

      if (result.healthy) {
        Logger.success(
          `Health check passed (${result.statusCode}, ${result.responseTime}ms)`
        );
        return true;
      }

      if (i < retries - 1) {
        Logger.warn(
          `Health check failed (attempt ${i + 1}/${retries}), retrying in ${interval / 1000}s...`
        );
        await this.sleep(interval);
      }
    }

    Logger.error(`Health check failed after ${retries} attempts`);
    return false;
  }

  /**
   * Wait for service to be ready
   */
  static async waitForReady(
    options: HealthCheckOptions,
    onProgress?: (attempt: number) => void
  ): Promise<boolean> {
    const retries = options.retries || 10;
    const interval = options.interval || 3000;

    for (let i = 0; i < retries; i++) {
      onProgress?.(i + 1);

      const result = await this.check(options);

      if (result.healthy) {
        return true;
      }

      if (i < retries - 1) {
        await this.sleep(interval);
      }
    }

    return false;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
