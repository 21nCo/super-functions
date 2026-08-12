import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
    mintTestToken,
    createAuthfnCollectionMiddleware,
} from "../authfn.js";
import { fetchRateLimits } from "../secfn.js";
import { logfnReporter, createCliLogger } from "../logfn.js";
import type { LogFnClient, SecFnRateLimiter, RateLimitInfo } from "../../types.js";
import type { AuthfnHttpClientRequest } from "../authfn.js";

describe("PHASE_22 Integrations", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================================
    // TV-AUTH-001 / NEG-TV-AUTH-001: authfn integration
    // =========================================================================
    describe("authfn integration", () => {
        it("mints a test token with valid TTL (TV-AUTH-001)", async () => {
            const fetchMock = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: "tk_123", expiresAt: "2026-03-06T19:00:00Z" }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const res = await mintTestToken(
                { baseUrl: "https://auth.api.example.com", adminKey: "admin_secret" },
                { ttl: 3600, scopes: ["read", "write"] }
            );

            expect(res.token).toBe("tk_123");
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const callArgs = fetchMock.mock.calls[0];
            expect(callArgs[0]).toBe("https://auth.api.example.com/admin/keys/test");
            expect(callArgs[1].headers).toMatchObject({
                Authorization: "Bearer admin_secret",
            });
            expect(JSON.parse(callArgs[1].body)).toMatchObject({
                ttl: 3600,
                scopes: ["read", "write"],
            });
        });

        it("rejects test tokens with TTL > 3600 (NEG-TV-AUTH-001)", async () => {
            await expect(
                mintTestToken(
                    { baseUrl: "http://localhost" },
                    { ttl: 3601 }
                )
            ).rejects.toThrow(/TTL cannot exceed 3600 seconds/);
        });

        it("injects token into collection requests via middleware", async () => {
            const mockBaseClient = {
                send: vi.fn().mockResolvedValue({ status: 200 }),
            };
            const client = createAuthfnCollectionMiddleware(mockBaseClient, "tk_injected");

            await client.send({
                method: "GET",
                url: "http://example.com/api",
                headers: { Accept: "application/json" },
            });

            expect(mockBaseClient.send).toHaveBeenCalledTimes(1);
            const req = mockBaseClient.send.mock.calls[0][0] as AuthfnHttpClientRequest;
            expect(req.headers["Authorization"]).toBe("Bearer tk_injected");
            expect(req.headers["Accept"]).toBe("application/json");
        });
    });

    // =========================================================================
    // TV-SEC-001: secfn integration
    // =========================================================================
    describe("secfn integration", () => {
        it("fetches rate limits for multiple endpoints (TV-SEC-001)", async () => {
            const mockRateLimiter: SecFnRateLimiter = {
                peek: vi.fn(async (endpoint: string) => {
                    if (endpoint === "GET /users") {
                        return { endpoint, method: "GET", remaining: 90, limit: 100, resetAt: 12345, blocked: false };
                    }
                    if (endpoint === "POST /orders") {
                        return { endpoint, method: "POST", remaining: 0, limit: 10, resetAt: 12345, blocked: true };
                    }
                    return null; // Endpoint not limited
                }),
            };

            const results = await fetchRateLimits(mockRateLimiter, [
                "GET /users",
                "POST /orders",
                "GET /health",
            ]);

            expect(results).toHaveLength(2);
            expect(results[0].remaining).toBe(90);
            expect(results[1].blocked).toBe(true);
            expect(mockRateLimiter.peek).toHaveBeenCalledTimes(3);
        });
    });

    // =========================================================================
    // TV-LOG-001: logfn integration
    // =========================================================================
    describe("logfn integration", () => {
        function createMockLogFn(): LogFnClient {
            return {
                info: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
                debug: vi.fn(),
                child: vi.fn().mockReturnThis(),
            };
        }

        it("reports collection runs to logfn (TV-LOG-001)", () => {
            const logfn = createMockLogFn();
            const reporter = logfnReporter(logfn);

            // onStart
            reporter.onStart?.(
                { info: { name: "Test Collection" } } as any,
                { environment: "staging" } as any
            );
            expect(logfn.info).toHaveBeenCalledWith("collection_run_start", {
                collection: "Test Collection",
                environment: "staging",
            });

            // onRequestComplete
            reporter.onRequestComplete?.({
                name: "Get User",
                method: "GET",
                url: "http://test",
                duration: 150,
                status: "passed",
            } as any);

            expect(logfn.child).toHaveBeenCalledWith({
                request_name: "Get User",
                method: "GET",
                url: "http://test",
                duration_ms: 150,
            });
            // The child logger is essentially `logfn` configured to `mockReturnThis`
            expect(logfn.info).toHaveBeenCalledWith("collection_request_complete", { status: "passed" });

            // onComplete
            reporter.onComplete?.({
                duration: 2000,
                summary: { total: 1, passed: 1 },
            } as any);

            expect(logfn.info).toHaveBeenCalledWith("collection_run_complete", {
                duration_ms: 2000,
                summary: { total: 1, passed: 1 },
            });
        });

        it("provides fallback CLI logger when logfn is not configured", () => {
            const consoleLogSpy = vi.spyOn(console, "info").mockImplementation(() => { });
            const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => { });

            const logger = createCliLogger({ level: "info" });
            logger.info("sys_ready", { pid: 1 });
            logger.debug("tracing", "hidden");

            expect(consoleLogSpy).toHaveBeenCalledWith("[INFO] sys_ready", { pid: 1 });
            expect(consoleDebugSpy).not.toHaveBeenCalled(); // level is info
        });
    });
});
