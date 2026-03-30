import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSearchFnServer } from "../src/server";
import { MemoryAdapter } from "@searchfn/adapter-memory";
import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { SearchAdapterError } from "@searchfn/adapter-contracts";

// Helper: make a request and get response body
async function req(
  router: { handle(r: Request): Promise<Response> },
  method: string,
  path: string,
  body?: unknown,
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const r = new Request(`http://localhost${path}`, init);
  const res = await router.handle(r);
  const json = await res.json();
  return { status: res.status, body: json };
}

describe("@searchfn/server routes", () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  afterEach(async () => {
    try { await adapter.dispose?.(); } catch { /* ignore */ }
  });

  // ── SRV-001: Constructor + endpoint registration ──

  describe("SRV-001: constructor and endpoint registration", () => {
    it("creates server with all 6 endpoints", async () => {
      const server = await createSearchFnServer({ adapter });
      const routes = server.router.getRoutes();
      const paths = routes.map((r: any) => `${r.method} ${r.path}`);

      expect(paths).toContain("GET /searchfn/status");
      expect(paths).toContain("POST /searchfn/index");
      expect(paths).toContain("POST /searchfn/search");
      expect(paths).toContain("POST /searchfn/search-all");
      expect(paths).toContain("POST /searchfn/remove");
      expect(paths).toContain("POST /searchfn/clear");
    });

    it("uses custom basePath", async () => {
      const server = await createSearchFnServer({ adapter, basePath: "/api/search" });
      const routes = server.router.getRoutes();
      const paths = routes.map((r: any) => `${r.method} ${r.path}`);
      expect(paths).toContain("GET /api/search/status");
      expect(paths).toContain("POST /api/search/search");
    });

    it("close() calls adapter.dispose", async () => {
      const disposeSpy = vi.fn();
      const mockAdapter: SearchAdapter = {
        name: "mock",
        async index() {},
        async search() { return []; },
        async remove() {},
        async clear() {},
        dispose: disposeSpy,
      };
      const server = await createSearchFnServer({ adapter: mockAdapter });
      await server.close();
      expect(disposeSpy).toHaveBeenCalledOnce();
    });

    it("close() works when adapter has no dispose", async () => {
      const mockAdapter: SearchAdapter = {
        name: "no-dispose",
        async index() {},
        async search() { return []; },
        async remove() {},
        async clear() {},
      };
      const server = await createSearchFnServer({ adapter: mockAdapter });
      await expect(server.close()).resolves.toBeUndefined();
    });
  });

  // ── SRV-004: Status endpoint ──

  describe("SRV-004: GET /status", () => {
    it("returns adapter name and capabilities", async () => {
      const server = await createSearchFnServer({ adapter });
      const { status, body } = await req(server.router, "GET", "/searchfn/status");
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.adapter).toBe("memory");
      expect(body.result.capabilities).toBeDefined();
      expect(typeof body.result.uptimeMs).toBe("number");
      expect(body.result.state).toBe("ok");
      expect(body.result.failureCount).toBe(0);
    });

    it("reports degraded state after a server failure", async () => {
      const failingAdapter: SearchAdapter = {
        name: "failing",
        async index() {
          throw new Error("boom");
        },
        async search() {
          return [];
        },
        async remove() {},
        async clear() {},
      };

      const server = await createSearchFnServer({ adapter: failingAdapter });
      const failed = await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [{ id: "t1", fields: { title: "hello" } }],
      });
      expect(failed.status).toBe(500);

      const { status, body } = await req(server.router, "GET", "/searchfn/status");
      expect(status).toBe(200);
      expect(body.result.state).toBe("degraded");
      expect(body.result.failureCount).toBe(1);
      expect(typeof body.result.degradedSince).toBe("number");
    });
  });

  // ── API-002: Canonical envelopes ──

  describe("API-002: canonical envelopes", () => {
    it("success envelope has ok:true + result", async () => {
      const server = await createSearchFnServer({ adapter });
      const { body } = await req(server.router, "GET", "/searchfn/status");
      expect(body).toHaveProperty("ok", true);
      expect(body).toHaveProperty("result");
      expect(body).not.toHaveProperty("error");
    });

    it("error envelope has ok:false + error.code + error.message", async () => {
      const server = await createSearchFnServer({ adapter });
      const { body } = await req(server.router, "POST", "/searchfn/search", {
        resource: "tasks",
        query: "   ",
      });
      expect(body.ok).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(typeof body.error.message).toBe("string");
    });
  });

  // ── POST /index success ──

  describe("POST /index", () => {
    it("indexes documents and returns count", async () => {
      const server = await createSearchFnServer({ adapter });
      const { status, body } = await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [
          { id: "t1", fields: { title: "hello world" } },
          { id: "t2", fields: { title: "goodbye" } },
        ],
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.indexed).toBe(2);
    });
  });

  // ── POST /search success (TV-API-002) ──

  describe("POST /search", () => {
    it("returns matching ids in envelope", async () => {
      const server = await createSearchFnServer({ adapter });
      await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [
          { id: "t-1", fields: { title: "hello world" } },
          { id: "t-2", fields: { title: "hello there" } },
          { id: "t-3", fields: { title: "goodbye" } },
        ],
      });

      const { status, body } = await req(server.router, "POST", "/searchfn/search", {
        resource: "tasks",
        query: "hello",
        limit: 2,
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ids).toBeDefined();
      expect(Array.isArray(body.result.ids)).toBe(true);
    });

    it("rejects invalid optional search parameters", async () => {
      const server = await createSearchFnServer({ adapter });
      const { status, body } = await req(server.router, "POST", "/searchfn/search", {
        resource: "tasks",
        query: "hello",
        fields: [""],
      });

      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
    });
  });

  // ── POST /search-all ──

  describe("POST /search-all", () => {
    it("returns merged results across resources", async () => {
      const server = await createSearchFnServer({ adapter });
      await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [{ id: "t1", fields: { title: "alpha beta" } }],
      });
      await req(server.router, "POST", "/searchfn/index", {
        resource: "notes",
        documents: [{ id: "n1", fields: { body: "alpha gamma" } }],
      });

      const { status, body } = await req(server.router, "POST", "/searchfn/search-all", {
        query: "alpha",
        resources: ["tasks", "notes"],
        limit: 10,
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.result.results)).toBe(true);
    });
  });

  // ── POST /remove ──

  describe("POST /remove", () => {
    it("removes documents", async () => {
      const server = await createSearchFnServer({ adapter });
      await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [{ id: "t1", fields: { title: "remove me" } }],
      });
      const { status, body } = await req(server.router, "POST", "/searchfn/remove", {
        resource: "tasks",
        ids: ["t1"],
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.removed).toBe(1);
    });
  });

  // ── POST /clear ──

  describe("POST /clear", () => {
    it("clears a resource", async () => {
      const server = await createSearchFnServer({ adapter });
      await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [{ id: "t1", fields: { title: "clear me" } }],
      });
      const { status, body } = await req(server.router, "POST", "/searchfn/clear", {
        resource: "tasks",
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.cleared).toBe("tasks");
    });

    it("rejects non-object request bodies", async () => {
      const server = await createSearchFnServer({ adapter });
      const { status, body } = await req(server.router, "POST", "/searchfn/clear", ["tasks"]);

      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
    });

    it("rejects missing resource on clear", async () => {
      const server = await createSearchFnServer({ adapter });
      const { status, body } = await req(server.router, "POST", "/searchfn/clear", {});

      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
    });
  });

  describe("error mapping", () => {
    it("maps SearchAdapterError with known code to matching HTTP status", async () => {
      const forbiddenAdapter: SearchAdapter = {
        name: "forbidden",
        async index() {
          throw new SearchAdapterError("FORBIDDEN", "Denied");
        },
        async search() {
          return [];
        },
        async remove() {},
        async clear() {},
      };
      const server = await createSearchFnServer({ adapter: forbiddenAdapter });
      const { status, body } = await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "x" } }],
      });
      expect(status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("maps unknown errors to INTERNAL", async () => {
      const badAdapter: SearchAdapter = {
        name: "bad",
        async index() {
          throw new Error("boom");
        },
        async search() {
          return [];
        },
        async remove() {},
        async clear() {},
      };
      const server = await createSearchFnServer({ adapter: badAdapter });
      const { status, body } = await req(server.router, "POST", "/searchfn/index", {
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "x" } }],
      });
      expect(status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INTERNAL");
    });
  });

  // TV-SRV-001: server search route passes prefix to adapter
  describe("TV-SRV-001: POST /search passes prefix to adapter", () => {
    it("forwards prefix: true from request body to adapter.search", async () => {
      const searchSpy = vi.fn().mockResolvedValue([]);
      const spyAdapter: SearchAdapter = {
        name: "spy",
        async index() {},
        search: searchSpy,
        async remove() {},
        async clear() {},
      };

      const server = await createSearchFnServer({ adapter: spyAdapter });
      await req(server.router, "POST", "/searchfn/search", {
        resource: "tasks",
        query: "to",
        prefix: true,
      });

      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: true }),
      );
    });

    it("forwards prefix: false (no bool.should) when prefix omitted", async () => {
      const searchSpy = vi.fn().mockResolvedValue([]);
      const spyAdapter: SearchAdapter = {
        name: "spy",
        async index() {},
        search: searchSpy,
        async remove() {},
        async clear() {},
      };

      const server = await createSearchFnServer({ adapter: spyAdapter });
      await req(server.router, "POST", "/searchfn/search", {
        resource: "tasks",
        query: "todo",
      });

      // prefix should be undefined (not passed), so adapter receives undefined
      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: undefined }),
      );
    });
  });

  // TV-SRV-002: server searchAll route passes prefix to adapter
  describe("TV-SRV-002: POST /search-all passes prefix to adapter", () => {
    it("forwards prefix: true to native adapter.searchAll", async () => {
      const searchAllSpy = vi.fn().mockResolvedValue([]);
      const spyAdapter: SearchAdapter = {
        name: "spy",
        async index() {},
        async search() { return []; },
        searchAll: searchAllSpy,
        async remove() {},
        async clear() {},
      };

      const server = await createSearchFnServer({ adapter: spyAdapter });
      await req(server.router, "POST", "/searchfn/search-all", {
        query: "to",
        resources: ["tasks"],
        prefix: true,
      });

      expect(searchAllSpy).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: true }),
      );
    });

    it("forwards prefix: true to fallback per-resource adapter.search when searchAll unavailable", async () => {
      const searchSpy = vi.fn().mockResolvedValue([]);
      const spyAdapter: SearchAdapter = {
        name: "spy-no-searchall",
        async index() {},
        search: searchSpy,
        async remove() {},
        async clear() {},
        // no searchAll
      };

      const server = await createSearchFnServer({ adapter: spyAdapter });
      await req(server.router, "POST", "/searchfn/search-all", {
        query: "to",
        resources: ["tasks"],
        prefix: true,
      });

      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: true }),
      );
    });
  });
});
