import type { RetryOptions } from './types.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

export interface ResolvedRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export function resolveRetryOptions(options?: RetryOptions): ResolvedRetryOptions {
  return {
    maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
    baseDelayMs: options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
  };
}

export function computeDelay(attempt: number, options: ResolvedRetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * options.baseDelayMs * 0.5;
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return false;
    if ('status' in error) {
      const status = (error as { status: number }).status;
      return status >= 500 || status === 429 || status === 408;
    }
    const message = error.message.toLowerCase();
    return message.includes('network') || message.includes('fetch');
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status >= 500 || status === 429 || status === 408;
    }
  }

  if (typeof error === 'string') {
    const message = error.toLowerCase();
    return message.includes('network') || message.includes('fetch');
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: ResolvedRetryOptions,
  signal?: AbortSignal
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt < options.maxRetries) {
        const delay = computeDelay(attempt, options);
        await sleep(delay, signal);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
