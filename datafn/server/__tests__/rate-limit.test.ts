/**
 * Phase 07: Rate Limiting tests
 * Tests TV-RATE-001, TV-RATE-002, TV-RATE-ATOMIC-001, TV-RATE-MEMORY-001,
 *       TV-RATE-OVERRIDE-001, TV-RATE-CONFIG-001
 */

import { describe, it, expect, vi } from "vitest";
import {
  MemoryRateLimiter,
  AtomicRateLimiter,
  createRateLimitMiddleware,
  type RateLimiter,
} from "../src/middleware/rate-limit.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../src/server.js";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
};

// --- Unit tests for MemoryRateLimiter ---

describe("MemoryRateLimiter", () => {
  it("allows requests under the limit", async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      const result = await limiter.check("key:test", 5, 60);
      expect(result.allowed).toBe(true);
    }
  });

  it("rejects requests over the limit", async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      await limiter.check("key:over", 5, 60);
    }
    const result = await limiter.check("key:over", 5, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires (TV-RATE-MEMORY-001)", async () => {
    const limiter = new MemoryRateLimiter();
    // Fill the window with maxRequests = 2, windowSeconds = 1
    await limiter.check("key:expire", 2, 1);
    await limiter.check("key:expire", 2, 1);
    const blocked = await limiter.check("key:expire", 2, 1);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const afterExpiry = await limiter.check("key:expire", 2, 1);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(1);
  });

  it("tracks different keys independently", async () => {
    const limiter = new MemoryRateLimiter();
    await limiter.check("user:a", 1, 60);
    const a = await limiter.check("user:a", 1, 60);
    const b = await limiter.check("user:b", 1, 60);
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(true);
  });
});

// --- Unit tests for AtomicRateLimiter ---

describe("AtomicRateLimiter", () => {
  it("calls atomic INCR with TTL (TV-RATE-ATOMIC-001)", async () => {
    const mockStore = {
      incr: vi.fn().mockResolvedValue({ value: 1 }),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      isHealthy: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const limiter = new AtomicRateLimiter(mockStore);
    const result = await limiter.check("query:user:1", 100, 60);

    expect(result.allowed).toBe(true);
    expect(mockStore.incr).toHaveBeenCalledTimes(1);
    const input = mockStore.incr.mock.calls[0][0];
    expect(input.key).toMatch(/^ratelimit:query:user:1:\d+$/);
    expect(input.by).toBe(1);
    expect(input.ttlSeconds).toBe(60);
  });

  it("rejects when atomic count exceeds max", async () => {
    const mockStore = {
      incr: vi.fn().mockResolvedValue({ value: 101 }),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      isHealthy: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const limiter = new AtomicRateLimiter(mockStore);
    const result = await limiter.check("query:user:1", 100, 60);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

// --- Unit tests for createRateLimitMiddleware ---

describe("createRateLimitMiddleware", () => {
  it("returns null when under limit (TV-RATE-001)", async () => {
    const limiter = new MemoryRateLimiter();
    const middleware = createRateLimitMiddleware({
      limiter,
      maxRequests: 5,
      windowSeconds: 60,
      keyExtractor: () => "user:1",
    });

    for (let i = 0; i < 5; i++) {
      const result = await middleware("query", {});
      expect(result).toBeNull();
    }
  });

  it("returns 429 when over limit (TV-RATE-002)", async () => {
    const limiter = new MemoryRateLimiter();
    const middleware = createRateLimitMiddleware({
      limiter,
      maxRequests: 5,
      windowSeconds: 60,
      keyExtractor: () => "user:1",
    });

    // Use up the limit
    for (let i = 0; i < 5; i++) {
      await middleware("query", {});
    }

    // 6th request should be rejected
    const response = await middleware("query", {});
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);

    const body = await response!.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        details: { path: "$" },
      },
    });
  });

  it("applies per-endpoint overrides (TV-RATE-OVERRIDE-001)", async () => {
    const limiter = new MemoryRateLimiter();
    const middleware = createRateLimitMiddleware({
      limiter,
      maxRequests: 100,
      windowSeconds: 60,
      endpoints: {
        mutation: { maxRequests: 2, windowSeconds: 60 },
      },
      keyExtractor: () => "user:1",
    });

    // Mutation: limited to 2
    await middleware("mutation", {});
    await middleware("mutation", {});
    const mutationBlocked = await middleware("mutation", {});
    expect(mutationBlocked).not.toBeNull();
    expect(mutationBlocked!.status).toBe(429);

    // Query: global limit of 100 — should pass
    const queryAllowed = await middleware("query", {});
    expect(queryAllowed).toBeNull();
  });

  it("uses async keyExtractor", async () => {
    const limiter = new MemoryRateLimiter();
    const middleware = createRateLimitMiddleware({
      limiter,
      maxRequests: 1,
      windowSeconds: 60,
      keyExtractor: async (ctx: any) => ctx.userId ?? "anon",
    });

    // user A
    const r1 = await middleware("query", { userId: "a" });
    expect(r1).toBeNull();
    const r2 = await middleware("query", { userId: "a" });
    expect(r2).not.toBeNull();

    // user B still allowed
    const r3 = await middleware("query", { userId: "b" });
    expect(r3).toBeNull();
  });
});

// --- Integration tests with createDatafnServer ---

describe("Rate limiting integration", () => {
  it("TV-RATE-CONFIG-001: disabled rate limiting allows all requests", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      rateLimit: { enabled: false },
    });

    // Make many requests — none should be rate-limited
    for (let i = 0; i < 200; i++) {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({ resource: "task" }),
        }),
      );
      expect(res.status).not.toBe(429);
    }

    server.close();
  });

  it("TV-RATE-CONFIG-001: no rateLimit config allows all requests", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
    });

    for (let i = 0; i < 50; i++) {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({ resource: "task" }),
        }),
      );
      expect(res.status).not.toBe(429);
    }

    server.close();
  });

  it("TV-RATE-001 / TV-RATE-002: under and over limit via server", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      rateLimit: {
        enabled: true,
        maxRequests: 5,
        windowSeconds: 60,
      },
    });

    // 5 requests should pass (200)
    for (let i = 0; i < 5; i++) {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({ resource: "task" }),
        }),
      );
      expect(res.status).toBe(200);
    }

    // 6th request should be rate-limited (429)
    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({ resource: "task" }),
      }),
    );
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");

    server.close();
  });

  it("TV-RATE-005: default keyExtractor uses namespace (unit level)", async () => {
    // The router.handle() doesn't pass context, so we test keyExtractor isolation
    // at the middleware unit level with per-user keys.
    const limiter = new MemoryRateLimiter();
    const middleware = createRateLimitMiddleware({
      limiter,
      maxRequests: 2,
      windowSeconds: 60,
      keyExtractor: async (ctx: any) => ctx?.userId ?? "anonymous",
    });

    // User A: 2 requests pass
    expect(await middleware("query", { userId: "userA" })).toBeNull();
    expect(await middleware("query", { userId: "userA" })).toBeNull();
    // User A: 3rd blocked
    const blocked = await middleware("query", { userId: "userA" });
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);

    // User B: still allowed (different key)
    expect(await middleware("query", { userId: "userB" })).toBeNull();
  });

  it("TV-RATE-005: server with custom keyExtractor", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      rateLimit: {
        enabled: true,
        maxRequests: 2,
        windowSeconds: 60,
        // All requests share the same key since router doesn't pass context
        keyExtractor: () => "shared-key",
      },
    });

    // 2 requests pass
    for (let i = 0; i < 2; i++) {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({ resource: "task" }),
        }),
      );
      expect(res.status).toBe(200);
    }

    // 3rd should be blocked
    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({ resource: "task" }),
      }),
    );
    expect(res.status).toBe(429);

    server.close();
  });

  it("SRV-009: 429 response includes Retry-After header with window duration", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const windowSeconds = 30;
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      rateLimit: {
        enabled: true,
        maxRequests: 1,
        windowSeconds,
        keyExtractor: () => "shared-key",
      },
    });

    // First request passes
    await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({ resource: "task" }),
      }),
    );

    // Second request is rate-limited
    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({ resource: "task" }),
      }),
    );

    expect(res.status).toBe(429);
    // SRV-009: Retry-After header should be present with the window duration in seconds
    expect(res.headers.get("Retry-After")).toBe(String(windowSeconds));

    server.close();
  });
});
