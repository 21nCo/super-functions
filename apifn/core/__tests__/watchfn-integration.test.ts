/**
 * watchfn integration tests (TV-WATCH-001 through TV-WATCH-004).
 *
 * All tests use vi.stubGlobal("fetch", ...) to mock HTTP without a real server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    fetchEndpointMetrics,
    createWatchFnClient,
    apifnWatchMiddleware,
} from "../src/integrations/watchfn.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = "http://watchfn.local:7100";

/** Minimal valid watchfn API metric shape. */
function mockMetric(overrides: Record<string, unknown> = {}) {
    return {
        method: "GET",
        path: "/users",
        latency_p50: 45,
        latency_p95: 120,
        latency_p99: 250,
        latency_avg: 60,
        rpm: 100,
        total_requests: 5000,
        error_rate: 0.01,
        error_count: 50,
        last_error: undefined,
        availability: 99.9,
        last_updated: "2026-03-06T06:00:00Z",
        ...overrides,
    };
}

function mockFetch(body: unknown, status = 200) {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    });
}

// ─── TV-WATCH-001: fetchEndpointMetrics ───────────────────────────────────────

describe("TV-WATCH-001: fetchEndpointMetrics", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", mockFetch([mockMetric(), mockMetric({ method: "POST", path: "/orders" })]));
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it("returns EndpointMetrics[] on success", async () => {
        const metrics = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(metrics).toHaveLength(2);
    });

    it("parses latency percentiles correctly", async () => {
        const [m] = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(m.latency.p50).toBe(45);
        expect(m.latency.p95).toBe(120);
        expect(m.latency.p99).toBe(250);
        expect(m.latency.avg).toBe(60);
    });

    it("parses throughput (rpm + total)", async () => {
        const [m] = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(m.throughput.rpm).toBe(100);
        expect(m.throughput.total).toBe(5000);
    });

    it("parses error rate and count", async () => {
        const [m] = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(m.errors.rate).toBe(0.01);
        expect(m.errors.count).toBe(50);
    });

    it("parses availability and lastUpdated", async () => {
        const [m] = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(m.availability).toBe(99.9);
        expect(m.lastUpdated).toBe("2026-03-06T06:00:00Z");
    });

    it("appends timeRange query param", async () => {
        await fetchEndpointMetrics({ baseUrl: BASE_URL, timeRange: "PT1H" });
        const calledUrl: string = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(calledUrl).toContain("timeRange=PT1H");
    });

    it("appends endpoint filter query params", async () => {
        await fetchEndpointMetrics({ baseUrl: BASE_URL, endpoints: ["GET /users", "POST /orders"] });
        const calledUrl: string = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(calledUrl).toContain("endpoint=GET+%2Fusers");
    });

    it("sends Authorization header when apiKey provided", async () => {
        await fetchEndpointMetrics({ baseUrl: BASE_URL, apiKey: "test-key" });
        const calledInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect((calledInit.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
    });

    it("handles data-wrapped response { data: [...] }", async () => {
        vi.stubGlobal("fetch", mockFetch({ data: [mockMetric()] }));
        const metrics = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(metrics).toHaveLength(1);
    });
});

// ─── TV-WATCH-001 (graceful degradation) ─────────────────────────────────────

describe("TV-WATCH-001: graceful degradation", () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it("returns [] and warns on network error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const metrics = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(metrics).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Could not reach watchfn"));
        warnSpy.mockRestore();
    });

    it("returns [] and warns on non-2xx response", async () => {
        vi.stubGlobal("fetch", mockFetch(null, 503));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const metrics = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(metrics).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("HTTP 503"));
        warnSpy.mockRestore();
    });

    it("returns [] on invalid JSON response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.reject(new SyntaxError("Unexpected token")),
        }));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const metrics = await fetchEndpointMetrics({ baseUrl: BASE_URL });
        expect(metrics).toEqual([]);
        warnSpy.mockRestore();
    });
});

// ─── createWatchFnClient ──────────────────────────────────────────────────────

describe("createWatchFnClient", () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it("returns a WatchFnClient with fetchMetrics()", () => {
        const client = createWatchFnClient({ baseUrl: BASE_URL });
        expect(typeof client.fetchMetrics).toBe("function");
    });

    it("fetchMetrics delegates to fetchEndpointMetrics", async () => {
        vi.stubGlobal("fetch", mockFetch([mockMetric()]));
        const client = createWatchFnClient({ baseUrl: BASE_URL });
        const metrics = await client.fetchMetrics({ timeRange: "PT1H" });
        expect(metrics).toHaveLength(1);
        const calledUrl: string = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(calledUrl).toContain("timeRange=PT1H");
    });
});

// ─── TV-WATCH-004: apifnWatchMiddleware ──────────────────────────────────────

describe("TV-WATCH-004: apifnWatchMiddleware", () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it("calls next() and then POSTs an event to watchfn", async () => {
        const postFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal("fetch", postFetch);

        const middleware = apifnWatchMiddleware({ baseUrl: BASE_URL, fireAndForget: false });
        const req = { method: "GET", path: "/users" };
        const res = { statusCode: 200 };
        let nextCalled = false;
        const next = async () => { nextCalled = true; };

        await middleware(req, res, next);

        expect(nextCalled).toBe(true);
        expect(postFetch).toHaveBeenCalledWith(
            expect.stringContaining("/api/events"),
            expect.objectContaining({ method: "POST" })
        );
    });

    it("event body contains method, path, status_code, duration_ms, timestamp", async () => {
        const postFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal("fetch", postFetch);

        const middleware = apifnWatchMiddleware({ baseUrl: BASE_URL, fireAndForget: false });
        await middleware({ method: "POST", path: "/orders" }, { statusCode: 201 }, async () => { });

        const body = JSON.parse(postFetch.mock.calls[0][1].body as string);
        expect(body.method).toBe("POST");
        expect(body.path).toBe("/orders");
        expect(body.status_code).toBe(201);
        expect(typeof body.duration_ms).toBe("number");
        expect(typeof body.timestamp).toBe("string");
    });

    it("does not crash when watchfn is unavailable (fire-and-forget)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

        const middleware = apifnWatchMiddleware({ baseUrl: BASE_URL, fireAndForget: true });
        // Should not throw
        await middleware({ method: "GET", path: "/ping" }, { statusCode: 200 }, async () => { });
        // Give microtasks time to resolve
        await new Promise((r) => setTimeout(r, 10));

        warnSpy.mockRestore();
    });

    it("silent mode suppresses warnings", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

        const middleware = apifnWatchMiddleware({ baseUrl: BASE_URL, fireAndForget: false, silent: true });
        await middleware({ method: "GET", path: "/x" }, { statusCode: 200 }, async () => { });
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("sends Authorization header when apiKey provided", async () => {
        const postFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal("fetch", postFetch);

        const middleware = apifnWatchMiddleware({ baseUrl: BASE_URL, apiKey: "watch-key", fireAndForget: false });
        await middleware({ method: "GET", path: "/" }, { statusCode: 200 }, async () => { });

        const headers = postFetch.mock.calls[0][1].headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer watch-key");
    });

    it("middleware uses req.url.pathname as fallback when req.path not set", async () => {
        const postFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal("fetch", postFetch);

        const middleware = apifnWatchMiddleware({ baseUrl: BASE_URL, fireAndForget: false });
        await middleware(
            { method: "GET", url: "http://localhost/api/items?q=test" },
            { statusCode: 200 },
            async () => { }
        );

        const body = JSON.parse(postFetch.mock.calls[0][1].body as string);
        expect(body.path).toBe("/api/items");
    });
});
