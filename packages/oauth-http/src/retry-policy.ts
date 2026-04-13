export interface OAuthRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  random: () => number;
}

export interface RetryDecisionInput {
  attempt: number;
  status?: number;
  retryAfterHeader?: string | null;
}

export interface RetryDecision {
  retry: boolean;
  delayMs: number;
}

export const DEFAULT_OAUTH_RETRY_POLICY: OAuthRetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 250,
  maxDelayMs: 10_000,
  jitterRatio: 0.2,
  random: Math.random
};

export function decideRetry(
  input: RetryDecisionInput,
  policy: OAuthRetryPolicy = DEFAULT_OAUTH_RETRY_POLICY
): RetryDecision {
  if (!shouldRetryStatus(input.status)) {
    return { retry: false, delayMs: 0 };
  }

  if (input.attempt >= policy.maxAttempts) {
    return { retry: false, delayMs: 0 };
  }

  const retryAfterMs = parseRetryAfter(input.retryAfterHeader);
  if (retryAfterMs !== null) {
    return { retry: true, delayMs: retryAfterMs };
  }

  const exponentialDelay = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (input.attempt - 1));
  const jitter = Math.floor(exponentialDelay * policy.jitterRatio * policy.random());
  return { retry: true, delayMs: exponentialDelay + jitter };
}

export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (!Number.isNaN(seconds) && Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateValue = Date.parse(value);
  if (Number.isNaN(dateValue)) {
    return null;
  }

  const now = Date.now();
  if (dateValue <= now) {
    return 0;
  }

  return dateValue - now;
}

function shouldRetryStatus(status?: number): boolean {
  if (status === undefined) {
    return false;
  }

  if (status === 429) {
    return true;
  }

  return status >= 500 && status <= 599;
}
