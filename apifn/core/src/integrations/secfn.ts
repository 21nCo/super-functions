import type { RateLimitInfo, SecFnRateLimiter } from "../types.js";

/**
 * Fetches rate limit headroom for a given list of endpoints (SEC-001).
 * Uses the provided SecFnRateLimiter's `peek()` method which does not consume tokens.
 *
 * @param rateLimiter The secfn rate limiter instance
 * @param endpoints Array of endpoints, e.g. ["GET /users", "POST /orders"]
 * @param context Optional context variables to resolve rate limit keys
 * @returns Array of RateLimitInfo objects detailing remaining limits and reset times
 */
export async function fetchRateLimits(
    rateLimiter: SecFnRateLimiter,
    endpoints: string[],
    context?: Record<string, string>
): Promise<RateLimitInfo[]> {
    const results: RateLimitInfo[] = [];

    for (const endpoint of endpoints) {
        try {
            const info = await rateLimiter.peek(endpoint, context);
            if (info) {
                results.push(info);
            }
        } catch (err) {
            console.warn(`[apifn/secfn] Failed to peek rate limit for ${endpoint}:`, err);
        }
    }

    return results;
}
