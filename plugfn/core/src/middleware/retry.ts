import type { RetryOptions } from '../types/action.js';
import type { Logger } from '../types/action.js';

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 5,
  delay: 1000,
  backoff: 'exponential',
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

interface RetryMiddlewareDependencies {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class ProviderRateLimitedError extends Error {
  readonly code = 'PROVIDER_RATE_LIMITED';
  readonly status = 429;
  readonly retryable = false;

  constructor(message = 'max retry attempts exceeded') {
    super(message);
    this.name = 'ProviderRateLimitedError';
  }
}

export class RetryMiddleware {
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private options: RetryOptions = {},
    private logger?: Logger,
    dependencies: RetryMiddlewareDependencies = {}
  ) {
    this.sleepFn = dependencies.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = dependencies.now ?? (() => Date.now());
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<{ data: T; retries: number }> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...this.options };
    let attempt = 0;

    while (attempt < opts.maxAttempts) {
      try {
        const data = await fn();

        if (attempt > 0) {
          this.logger?.info(`${context || 'Action'} succeeded after ${attempt} retries`);
        }

        return { data, retries: attempt };
      } catch (error) {
        attempt += 1;
        const retryableError = error as any;

        if (!this.isRetryable(retryableError, opts)) {
          this.logger?.warn(`${context || 'Action'} failed with non-retryable error`, { error });
          throw error;
        }

        if (attempt >= opts.maxAttempts) {
          if (this.isProviderRateLimitError(retryableError)) {
            const rateLimitedError = new ProviderRateLimitedError('max retry attempts exceeded');
            this.logger?.error(`${context || 'Action'} rate-limited after ${attempt} attempts`, {
              error: retryableError,
            });
            throw rateLimitedError;
          }

          this.logger?.error(`${context || 'Action'} failed after ${attempt} attempts`, {
            error: retryableError,
          });
          throw error;
        }

        const delay = this.calculateDelay(attempt, opts, retryableError);

        this.logger?.warn(
          `${context || 'Action'} failed (attempt ${attempt}/${opts.maxAttempts}), retrying in ${delay}ms`,
          { error: retryableError }
        );

        await this.sleepFn(delay);
      }
    }

    throw new Error('retry execution terminated unexpectedly');
  }

  private isRetryable(error: any, options: Required<RetryOptions>): boolean {
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
      return true;
    }

    if (typeof error?.status === 'number' && options.retryableStatusCodes.includes(error.status)) {
      return true;
    }

    return false;
  }

  private isProviderRateLimitError(error: any): boolean {
    return error?.status === 429;
  }

  private calculateDelay(attempt: number, options: Required<RetryOptions>, error: any): number {
    const baseDelay =
      options.backoff === 'exponential'
        ? options.delay * Math.pow(2, attempt - 1)
        : options.delay * attempt;

    const retryAfterMs = this.extractRetryAfterMs(error);
    if (retryAfterMs === undefined) {
      return baseDelay;
    }

    return Math.max(baseDelay, retryAfterMs);
  }

  private extractRetryAfterMs(error: any): number | undefined {
    if (typeof error?.retryAfterMs === 'number' && Number.isFinite(error.retryAfterMs)) {
      return Math.max(0, error.retryAfterMs);
    }

    if (typeof error?.retryAfterSeconds === 'number' && Number.isFinite(error.retryAfterSeconds)) {
      return Math.max(0, error.retryAfterSeconds * 1000);
    }

    const retryAfterHeader = this.readRetryAfterHeader(error?.headers);
    if (!retryAfterHeader) {
      return undefined;
    }

    const asNumber = Number(retryAfterHeader);
    if (Number.isFinite(asNumber)) {
      return Math.max(0, asNumber * 1000);
    }

    const retryAt = Date.parse(retryAfterHeader);
    if (Number.isNaN(retryAt)) {
      return undefined;
    }

    return Math.max(0, retryAt - this.now());
  }

  private readRetryAfterHeader(headers: unknown): string | undefined {
    if (!headers) {
      return undefined;
    }

    if (typeof (headers as any).get === 'function') {
      const value = (headers as any).get('retry-after');
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    }

    if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
        if (key.toLowerCase() === 'retry-after' && typeof value === 'string' && value.length > 0) {
          return value;
        }
      }
    }

    return undefined;
  }
}
