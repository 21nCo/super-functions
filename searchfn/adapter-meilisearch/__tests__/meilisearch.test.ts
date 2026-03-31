import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { MeilisearchAdapter } from "../src/index";
import { SearchAdapterError } from "@searchfn/adapter-contracts";
import { redactSensitive as redactMeiliSensitive } from "../src/internal/redaction";

const MEILI_URL = process.env.SEARCHFN_MEILI_URL ?? "http://localhost:7700";
const MEILI_API_KEY = process.env.SEARCHFN_MEILI_API_KEY;

let testCounter = 0;

async function canConnect(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health", url), { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

describe("MeilisearchAdapter integration", () => {
  let available = false;
  let adapter: MeilisearchAdapter;

  beforeAll(async () => {
    available = await canConnect(MEILI_URL);
    if (!available) {
      console.warn("Meilisearch not available, skipping integration tests");
    }
  });

  beforeEach(async () => {
    if (!available) return;

    adapter = new MeilisearchAdapter({
      host: MEILI_URL,
      apiKey: MEILI_API_KEY,
      indexPrefix: `searchfn_meili_test_${++testCounter}`,
      requestTimeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 25, maxDelayMs: 100 },
    });

    await adapter.initialize({
      resources: [
        { name: "docs", searchFields: ["title", "body"] },
        { name: "notes", searchFields: ["content"] },
      ],
    });
  });

  afterAll(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  it("implements initialize/index/search/remove/clear", async () => {
    if (!available) return;

    await adapter.index({
      resource: "docs",
      documents: [{ id: "d1", fields: { title: "Hello World", body: "incident" } }],
    });

    const first = await adapter.search({ resource: "docs", query: "hello", limit: 10 });
    expect(first).toEqual(["d1"]);

    await adapter.remove({ resource: "docs", ids: ["d1"] });
    const afterRemove = await adapter.search({ resource: "docs", query: "hello", limit: 10 });
    expect(afterRemove).toEqual([]);

    await adapter.index({
      resource: "docs",
      documents: [{ id: "d2", fields: { title: "Hello Again", body: "incident" } }],
    });
    await adapter.clear("docs");
    const afterClear = await adapter.search({ resource: "docs", query: "hello", limit: 10 });
    expect(afterClear).toEqual([]);
  });

  it("supports searchAll deterministic ordering and field filter", async () => {
    if (!available) return;

    await adapter.index({
      resource: "docs",
      documents: [{ id: "d1", fields: { title: "incident title", body: "body only" } }],
    });
    await adapter.index({
      resource: "notes",
      documents: [{ id: "n1", fields: { content: "incident title" } }],
    });

    const bodyFiltered = await adapter.search({
      resource: "docs",
      query: "body",
      fields: ["title"],
      limit: 10,
    });
    expect(bodyFiltered).toEqual([]);

    const all = await adapter.searchAll({ query: "incident", limit: 10 });
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1];
      const curr = all[i];
      const valid =
        prev.score > curr.score ||
        (prev.score === curr.score && prev.resource < curr.resource) ||
        (prev.score === curr.score && prev.resource === curr.resource && String(prev.id) <= String(curr.id));
      expect(valid).toBe(true);
    }
  });

  it("remove and clear are idempotent", async () => {
    if (!available) return;

    await adapter.index({
      resource: "docs",
      documents: [{ id: "d3", fields: { title: "idempotent" } }],
    });

    await adapter.remove({ resource: "docs", ids: ["d3"] });
    await expect(adapter.remove({ resource: "docs", ids: ["d3"] })).resolves.toBeUndefined();

    await adapter.clear("docs");
    await expect(adapter.clear("docs")).resolves.toBeUndefined();
  });
});

describe("MeilisearchAdapter resilience", () => {
  it("redacts plain connection keys without over-redacting connectionTimeout", () => {
    expect(
      redactMeiliSensitive({
        connection: "http://user:pass@example.test",
        connectionTimeout: 5000,
      }),
    ).toEqual({
      connection: "[REDACTED]",
      connectionTimeout: 5000,
    });
  });

  it("redacts Error instances instead of returning them unchanged", () => {
    const error = Object.assign(new Error("apiKey=secret"), {
      connection: "http://user:pass@example.test",
    });

    expect(redactMeiliSensitive(error)).toMatchObject({
      name: "Error",
      message: "apiKey=[REDACTED]",
      connection: "[REDACTED]",
    });
  });

  it("maps auth failures to FORBIDDEN", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    });

    try {
      const adapter = new MeilisearchAdapter({ host: "http://localhost:7700", apiKey: "bad-key" });
      await adapter.search({ resource: "docs", query: "hello", limit: 5 });
      expect.fail("expected auth failure");
    } catch (err) {
      expect((err as SearchAdapterError).code).toBe("FORBIDDEN");
      expect((err as Error).message).toContain("Meilisearch authorization failed");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("enforces bounded retry budget on retryable failures", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
    });

    try {
      const adapter = new MeilisearchAdapter({
        host: "http://localhost:7700",
        retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 },
        requestTimeoutMs: 100,
      });
      await adapter.search({ resource: "docs", query: "hello", limit: 5 });
      expect.fail("expected retry exhaustion");
    } catch (err) {
      expect((err as SearchAdapterError).code).toBe("INTERNAL");
      expect((err as Error).message).toContain("Retry budget exhausted");
    } finally {
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      fetchSpy.mockRestore();
    }
  });

  it("normalizes searchAll scores across resources", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.startsWith("/indexes/searchfn_docs_") && pathname.endsWith("/search")) {
        return new Response(
          JSON.stringify({ hits: [{ id: "d1" }, { id: "d2" }, { id: "d3" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ hits: [{ id: "n1" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    try {
      const adapter = new MeilisearchAdapter({ host: "http://localhost:7700" });
      const results = await adapter.searchAll({
        resources: ["docs", "notes"],
        query: "incident",
        limit: 10,
      });

      expect(results.slice(0, 4)).toEqual([
        { resource: "docs", id: "d1", score: 1 },
        { resource: "notes", id: "n1", score: 1 },
        { resource: "docs", id: "d2", score: 2 / 3 },
        { resource: "docs", id: "d3", score: 1 / 3 },
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("preserves non-canonical numeric string ids", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ hits: [{ id: "0123" }, { id: "9007199254740993" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    try {
      const adapter = new MeilisearchAdapter({ host: "http://localhost:7700" });
      const results = await adapter.search({ resource: "docs", query: "hello", limit: 10 });
      expect(results).toEqual(["0123", "9007199254740993"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("resets tracked resources on reinitialize", async () => {
    const urls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      urls.push(String(url));
      const pathname = new URL(String(url)).pathname;
      if (pathname.startsWith("/tasks/")) {
        return new Response(JSON.stringify({ status: "succeeded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (pathname.endsWith("/search")) {
        return new Response(JSON.stringify({ hits: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ taskUid: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const adapter = new MeilisearchAdapter({ host: "http://localhost:7700" });
      await adapter.initialize({
        resources: [{ name: "docs", searchFields: ["title"] }],
      });
      await adapter.initialize({
        resources: [{ name: "notes", searchFields: ["title"] }],
      });

      urls.length = 0;
      await adapter.searchAll({ query: "hello", limit: 10 });

      expect(urls.some((url) => url.includes("/indexes/searchfn_docs_"))).toBe(false);
      expect(urls.some((url) => url.includes("/indexes/searchfn_notes_"))).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns no results for explicit empty field or resource allow-lists", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const adapter = new MeilisearchAdapter({ host: "http://localhost:7700" });

      await expect(
        adapter.search({ resource: "docs", query: "hello", fields: [], limit: 10 }),
      ).resolves.toEqual([]);
      await expect(
        adapter.searchAll({ query: "hello", fields: [], limit: 10 }),
      ).resolves.toEqual([]);
      await expect(
        adapter.searchAll({ query: "hello", resources: [], limit: 10 }),
      ).resolves.toEqual([]);

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ── TV-MS-001/002: prefix capability and defaults ────────────────────────────

describe("MeilisearchAdapter — prefix capability and defaults", () => {
  // TV-MS-001: capabilities do not advertise unsupported prefix toggling
  it("TV-MS-001: capabilities include prefix: false", () => {
    const adapter = new MeilisearchAdapter({ host: "http://localhost:7700" });
    expect(adapter.capabilities.prefix).toBe(false);
  });

  // TV-MS-002: construct with defaults does not throw
  it("TV-MS-002: accepts defaults option without error", () => {
    expect(() => {
      const adapter = new MeilisearchAdapter({
        host: "http://localhost:7700",
        defaults: { prefix: true, fuzzy: true },
      });
      // Verify the adapter was created and has the right name
      expect(adapter.name).toBe("meilisearch");
    }).not.toThrow();
  });

  it("TV-MS-FUZZY-DEFAULT: defaults.fuzzy is applied to search requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({ hits: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const adapter = new MeilisearchAdapter({
      host: "http://localhost:7700",
      defaults: { fuzzy: true },
    });

    try {
      await adapter.search({ resource: "docs", query: "test", limit: 5 });
      // When fuzzy default is true, typoTolerance should be undefined (not "min")
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.typoTolerance).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
