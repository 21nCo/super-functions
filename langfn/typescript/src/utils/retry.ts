import { LangFnError, RateLimitError } from "../core/errors.js";

export interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnCodes?: readonly string[];
}

function shouldRetry(error: unknown, retryOnCodes: readonly string[]): boolean {
  return error instanceof LangFnError && retryOnCodes.includes(error.code);
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const maxAttempts = config.maxAttempts ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 250;
  const maxDelayMs = config.maxDelayMs ?? 5_000;
  const retryOnCodes = config.retryOnCodes ?? ["PROVIDER_RATE_LIMIT", "PROVIDER_TIMEOUT"];

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error, retryOnCodes)) {
        throw error;
      }

      let delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      delay = delay * (0.8 + Math.random() * 0.4);
      if (error instanceof RateLimitError && error.retryAfter !== undefined) {
        delay = Math.max(delay, error.retryAfter * 1_000);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
