import { SearchAdapterError } from "@searchfn/adapter-contracts";

export interface RetryPolicy {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface NormalizedRetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RetryAttemptContext {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  reason: string;
}

export interface RunWithRetryOptions {
  policy?: RetryPolicy;
  isRetryableError?: (error: unknown) => boolean;
  isRetryableResult?: <T>(result: T) => boolean;
  exhaustedError?: Error;
  onRetry?: (context: RetryAttemptContext) => void;
}

const DEFAULT_RETRY_POLICY: NormalizedRetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
};

function normalizeFiniteInteger(value: number | undefined, fallback: number, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.floor(value));
}

export function normalizeRetryPolicy(policy?: RetryPolicy): NormalizedRetryPolicy {
  const maxRetries = normalizeFiniteInteger(policy?.maxRetries, DEFAULT_RETRY_POLICY.maxRetries, 0);
  const baseDelayMs = normalizeFiniteInteger(policy?.baseDelayMs, DEFAULT_RETRY_POLICY.baseDelayMs, 1);
  const maxDelayMs = Math.max(
    baseDelayMs,
    normalizeFiniteInteger(policy?.maxDelayMs, DEFAULT_RETRY_POLICY.maxDelayMs, 1),
  );

  return {
    maxRetries,
    baseDelayMs,
    maxDelayMs,
  };
}

export function computeRetryDelayMs(attempt: number, policy: NormalizedRetryPolicy): number {
  const exponential = policy.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(policy.baseDelayMs * 0.25 * (attempt + 1));
  return Math.min(exponential + jitter, policy.maxDelayMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWithRetry<T>(
  operation: () => Promise<T>,
  options: RunWithRetryOptions = {},
): Promise<T> {
  const policy = normalizeRetryPolicy(options.policy);
  const exhaustedError = options.exhaustedError ?? new SearchAdapterError("INTERNAL", "Retry budget exhausted");

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      const result = await operation();
      const retryableResult = options.isRetryableResult?.(result) ?? false;
      if (retryableResult && attempt < policy.maxRetries) {
        const delayMs = computeRetryDelayMs(attempt, policy);
        options.onRetry?.({
          attempt,
          maxRetries: policy.maxRetries,
          delayMs,
          reason: "retryable_result",
        });
        await sleep(delayMs);
        continue;
      }
      if (retryableResult) {
        throw exhaustedError;
      }
      return result;
    } catch (error) {
      const retryable = options.isRetryableError?.(error) ?? false;
      if (retryable && attempt < policy.maxRetries) {
        const delayMs = computeRetryDelayMs(attempt, policy);
        options.onRetry?.({
          attempt,
          maxRetries: policy.maxRetries,
          delayMs,
          reason: "retryable_error",
        });
        await sleep(delayMs);
        continue;
      }
      if (retryable) {
        throw exhaustedError;
      }
      throw error;
    }
  }

  throw exhaustedError;
}
