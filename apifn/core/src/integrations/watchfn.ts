/**
 * watchfn integration for @apifn/core (WATCH-001 through WATCH-004).
 *
 * Provides:
 *  - `fetchEndpointMetrics()` — fetch performance metrics from a watchfn HTTP API
 *  - `createWatchFnClient()` — factory that returns a WatchFnClient
 *  - `apifnWatchMiddleware()` — @superfunctions/http middleware that reports per-route
 *    metrics to watchfn via its event API
 */

import type { EndpointMetrics, WatchFnClient } from "../types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FetchEndpointMetricsOptions {
    /** watchfn query API base URL (e.g. "http://localhost:7100") */
    baseUrl: string;
    /** ISO 8601 duration string, e.g. "PT1H" for last 1 hour */
    timeRange?: string;
    /** Filter to specific endpoint keys in the form "METHOD /path" */
    endpoints?: string[];
    /** Request timeout in ms (default: 5000) */
    timeoutMs?: number;
    /** Optional API key for watchfn */
    apiKey?: string;
}

/** Shape of a single metric entry returned by the watchfn query API. */
interface WatchFnApiMetric {
    method: string;
    path: string;
    latency_p50: number;
    latency_p95: number;
    latency_p99: number;
    latency_avg: number;
    rpm: number;
    total_requests: number;
    error_rate: number;
    error_count: number;
    last_error?: string;
    availability: number;
    last_updated: string;
}

/** Watchfn event API request body. */
interface WatchFnEvent {
    method: string;
    path: string;
    status_code: number;
    duration_ms: number;
    timestamp: string;
}

export interface CreateWatchFnClientOptions extends Omit<FetchEndpointMetricsOptions, "endpoints" | "timeRange"> { }

export interface WatchFnMiddlewareOptions {
    /** watchfn event API base URL (e.g. "http://localhost:7100") */
    baseUrl: string;
    /** Optional API key */
    apiKey?: string;
    /** Fire-and-forget: do not await event POST (default: true) */
    fireAndForget?: boolean;
    /** Suppress console warnings on errors (default: false) */
    silent?: boolean;
    /** Event POST timeout in ms (default: 2000) */
    timeoutMs?: number;
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseMetric(raw: WatchFnApiMetric): EndpointMetrics {
    return {
        method: raw.method,
        path: raw.path,
        latency: {
            p50: raw.latency_p50,
            p95: raw.latency_p95,
            p99: raw.latency_p99,
            avg: raw.latency_avg,
        },
        throughput: {
            rpm: raw.rpm,
            total: raw.total_requests,
        },
        errors: {
            rate: raw.error_rate,
            count: raw.error_count,
            lastError: raw.last_error,
        },
        availability: raw.availability,
        lastUpdated: raw.last_updated,
    };
}

// ─── fetchEndpointMetrics ─────────────────────────────────────────────────────

/**
 * Fetch endpoint metrics from a watchfn query API endpoint.
 *
 * On network failure or non-2xx response, returns [] with a console.warn
 * (graceful degradation — WATCH-001, WATCH-002).
 *
 * @example
 * const metrics = await fetchEndpointMetrics({
 *   baseUrl: "http://localhost:7100",
 *   timeRange: "PT1H",
 *   endpoints: ["GET /users", "POST /orders"],
 * });
 */
export async function fetchEndpointMetrics(
    options: FetchEndpointMetricsOptions
): Promise<EndpointMetrics[]> {
    const {
        baseUrl,
        timeRange,
        endpoints,
        timeoutMs = 5000,
        apiKey,
    } = options;

    const url = new URL("/api/metrics", baseUrl.replace(/\/$/, ""));

    if (timeRange) url.searchParams.set("timeRange", timeRange);
    if (endpoints?.length) {
        for (const ep of endpoints) url.searchParams.append("endpoint", ep);
    }

    const headers: Record<string, string> = {
        Accept: "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    let res: Response;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            res = await fetch(url.toString(), { headers, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    } catch (err) {
        // Network error or abort — graceful degradation
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[apifn/watchfn] Could not reach watchfn at ${baseUrl}: ${msg}`);
        return [];
    }

    if (!res.ok) {
        console.warn(
            `[apifn/watchfn] watchfn returned HTTP ${res.status} from ${url.toString()}`
        );
        return [];
    }

    let body: unknown;
    try {
        body = await res.json();
    } catch {
        console.warn("[apifn/watchfn] Failed to parse watchfn response as JSON");
        return [];
    }

    const rawList = Array.isArray(body)
        ? body
        : Array.isArray((body as { data?: unknown }).data)
            ? (body as { data: unknown[] }).data
            : [];

    return (rawList as WatchFnApiMetric[]).map(parseMetric);
}

// ─── createWatchFnClient ──────────────────────────────────────────────────────

/**
 * Creates a `WatchFnClient` object compatible with the UI components.
 *
 * @example
 * const client = createWatchFnClient({ baseUrl: "http://localhost:7100" });
 * const metrics = await client.fetchMetrics({ timeRange: "PT1H" });
 */
export function createWatchFnClient(
    options: CreateWatchFnClientOptions
): WatchFnClient {
    return {
        fetchMetrics: (opts) =>
            fetchEndpointMetrics({
                ...options,
                timeRange: opts?.timeRange,
                endpoints: opts?.endpoints,
            }),
    };
}

// ─── apifnWatchMiddleware ─────────────────────────────────────────────────────

/**
 * @superfunctions/http middleware that captures route metrics and ships them
 * to a watchfn event API endpoint (WATCH-004).
 *
 * @example
 * router.use(apifnWatchMiddleware({ baseUrl: "http://localhost:7100" }));
 */
export function apifnWatchMiddleware(
    options: WatchFnMiddlewareOptions
): (req: unknown, res: unknown, next: (...args: unknown[]) => unknown) => Promise<void> {
    const {
        baseUrl,
        apiKey,
        fireAndForget = true,
        silent = false,
        timeoutMs = 2000,
    } = options;

    const eventUrl = `${baseUrl.replace(/\/$/, "")}/api/events`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    async function sendEvent(event: WatchFnEvent): Promise<void> {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            let res: Response;
            try {
                res = await fetch(eventUrl, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(event),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }
            if (!res.ok && !silent) {
                console.warn(`[apifn/watchfn] Event POST returned HTTP ${res.status}`);
            }
        } catch (err) {
            if (!silent) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[apifn/watchfn] Failed to send event to watchfn: ${msg}`);
            }
        }
    }

    /**
     * The actual middleware function.
     * Compatible with @superfunctions/http Middleware signature:
     *   (req, res, next) => void | Promise<void>
     */
    return async function watchMiddleware(req: unknown, res: unknown, next: (...args: unknown[]) => unknown): Promise<void> {
        const start = Date.now();

        await next();

        const durationMs = Date.now() - start;

        // Extract method/path/status from request/response objects
        // @superfunctions/http uses req.method, req.path (or req.url), res.statusCode
        const r = req as { method?: string; path?: string; url?: string };
        const s = res as { statusCode?: number };

        const method = r.method ?? "UNKNOWN";
        const path = r.path ?? (r.url ? new URL(r.url, "http://localhost").pathname : "/unknown");
        const statusCode = s.statusCode ?? 200;

        const event: WatchFnEvent = {
            method,
            path,
            status_code: statusCode,
            duration_ms: durationMs,
            timestamp: new Date().toISOString(),
        };

        if (fireAndForget) {
            // Non-blocking — don't hold up the response
            sendEvent(event).catch(() => {/* already warned inside sendEvent */ });
        } else {
            await sendEvent(event);
        }
    };
}
