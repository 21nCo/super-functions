import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSearchClient, SearchClientValidationError } from "../src/client";
import type { SearchAdapter, SearchAllResult } from "@searchfn/adapter-contracts";

function createMockAdapter(overrides?: Partial<SearchAdapter>): SearchAdapter {
  return {
    name: "mock",
    capabilities: {
      persistent: false,
      searchAll: true,
      fuzzy: true,
      fieldBoosts: true,
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    index: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    searchAll: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createSearchClient", () => {
  let adapter: SearchAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("throws if adapter is not provided", () => {
    expect(() => createSearchClient({ adapter: null as any })).toThrow("adapter is required");
  });

  describe("delegation", () => {
    it("delegates index to adapter", async () => {
      const client = createSearchClient({ adapter });
      const params = { resource: "tasks", documents: [{ id: "1", fields: { title: "hello" } }] };
      await client.index(params);
      expect(adapter.index).toHaveBeenCalledWith(params);
    });

    it("delegates search to adapter with defaults applied", async () => {
      const client = createSearchClient({ adapter });
      await client.search({ resource: "tasks", query: "hello" });
      expect(adapter.search).toHaveBeenCalledWith(expect.objectContaining({
        resource: "tasks",
        query: "hello",
        limit: 10, // default
      }));
    });

    it("delegates remove to adapter", async () => {
      const client = createSearchClient({ adapter });
      await client.remove({ resource: "tasks", ids: ["1", "2"] });
      expect(adapter.remove).toHaveBeenCalledWith({ resource: "tasks", ids: ["1", "2"] });
    });

    it("delegates clear to adapter", async () => {
      const client = createSearchClient({ adapter });
      await client.clear("tasks");
      expect(adapter.clear).toHaveBeenCalledWith("tasks", undefined);
    });

    it("delegates dispose to adapter", async () => {
      const client = createSearchClient({ adapter });
      await client.dispose();
      expect(adapter.dispose).toHaveBeenCalled();
    });

    it("delegates searchAll to adapter when supported", async () => {
      const client = createSearchClient({ adapter });
      await client.searchAll({ query: "hello", resources: ["tasks"] });
      expect(adapter.searchAll).toHaveBeenCalled();
    });

    it("delegates initialize when adapter supports it", async () => {
      const client = createSearchClient({ adapter });
      expect(client.initialize).toBeDefined();
      await client.initialize!({ resources: [{ name: "tasks", searchFields: ["title"] }] });
      expect(adapter.initialize).toHaveBeenCalledWith({
        resources: [{ name: "tasks", searchFields: ["title"] }],
      });
    });

    it("does not expose initialize when adapter lacks it", () => {
      const noInitAdapter = createMockAdapter();
      delete (noInitAdapter as any).initialize;
      const client = createSearchClient({ adapter: noInitAdapter });
      expect(client.initialize).toBeUndefined();
    });
  });

  describe("adapterInfo", () => {
    it("returns adapter name and capabilities", () => {
      const client = createSearchClient({ adapter });
      const info = client.adapterInfo();
      expect(info.name).toBe("mock");
      expect(info.capabilities?.searchAll).toBe(true);
    });
  });

  describe("defaults", () => {
    it("applies custom default limit", async () => {
      const client = createSearchClient({ adapter, defaults: { limit: 25 } });
      await client.search({ resource: "tasks", query: "test" });
      expect(adapter.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
    });

    it("applies custom default fuzzy", async () => {
      const client = createSearchClient({ adapter, defaults: { fuzzy: 1 } });
      await client.search({ resource: "tasks", query: "test" });
      expect(adapter.search).toHaveBeenCalledWith(expect.objectContaining({ fuzzy: 1 }));
    });

    it("per-call params override defaults", async () => {
      const client = createSearchClient({ adapter, defaults: { limit: 25, fuzzy: true } });
      await client.search({ resource: "tasks", query: "test", limit: 5, fuzzy: false });
      expect(adapter.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, fuzzy: false }));
    });

    // TV-CLT-001: client resolves prefix from defaults
    it("TV-CLT-001: applies default prefix to search when query param omits it", async () => {
      const client = createSearchClient({ adapter, defaults: { prefix: true } });
      await client.search({ resource: "tasks", query: "to" });
      expect(adapter.search).toHaveBeenCalledWith(expect.objectContaining({ prefix: true }));
    });

    it("TV-CLT-001: applies default prefix to searchAll when query param omits it", async () => {
      const client = createSearchClient({ adapter, defaults: { prefix: true } });
      await client.searchAll({ query: "to", resources: ["tasks"] });
      expect(adapter.searchAll).toHaveBeenCalledWith(expect.objectContaining({ prefix: true }));
    });

    it("TV-CLT-001: applies default fieldBoosts to search when query param omits it", async () => {
      const client = createSearchClient({ adapter, defaults: { fieldBoosts: { title: 2 } } });
      await client.search({ resource: "tasks", query: "test" });
      expect(adapter.search).toHaveBeenCalledWith(
        expect.objectContaining({ fieldBoosts: { title: 2 } }),
      );
    });

    // TV-CLT-002: query-time values override defaults
    it("TV-CLT-002: query-time prefix: false overrides default prefix: true in search", async () => {
      const client = createSearchClient({ adapter, defaults: { prefix: true } });
      await client.search({ resource: "tasks", query: "to", prefix: false });
      expect(adapter.search).toHaveBeenCalledWith(expect.objectContaining({ prefix: false }));
    });

    it("TV-CLT-002: query-time prefix: false overrides default prefix: true in searchAll", async () => {
      const client = createSearchClient({ adapter, defaults: { prefix: true } });
      await client.searchAll({ query: "to", resources: ["tasks"], prefix: false });
      expect(adapter.searchAll).toHaveBeenCalledWith(expect.objectContaining({ prefix: false }));
    });

    it("TV-CLT-002: query-time fieldBoosts override default fieldBoosts", async () => {
      const client = createSearchClient({ adapter, defaults: { fieldBoosts: { title: 2 } } });
      await client.search({ resource: "tasks", query: "test", fieldBoosts: { body: 3 } });
      expect(adapter.search).toHaveBeenCalledWith(
        expect.objectContaining({ fieldBoosts: { body: 3 } }),
      );
    });
  });

  describe("validation", () => {
    it("rejects empty resource on search", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.search({ resource: "", query: "x" })).rejects.toThrow("resource must be a non-empty string");
    });

    it("rejects empty query on search", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.search({ resource: "tasks", query: "   " })).rejects.toThrow("Search query must not be empty");
    });

    it("rejects query exceeding max length", async () => {
      const client = createSearchClient({ adapter });
      const longQuery = "a".repeat(1001);
      await expect(client.search({ resource: "tasks", query: longQuery })).rejects.toThrow("query exceeds maximum length");
    });

    it("rejects non-positive limit on search", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.search({ resource: "tasks", query: "x", limit: 0 })).rejects.toThrow("limit must be a positive number");
    });

    it("rejects limit exceeding max on search", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.search({ resource: "tasks", query: "x", limit: 100_000 })).rejects.toThrow("limit exceeds maximum");
    });

    it("rejects empty resource on index", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.index({ resource: "", documents: [] })).rejects.toThrow("resource must be a non-empty string");
    });

    it("rejects documents exceeding max batch on index", async () => {
      const client = createSearchClient({ adapter });
      const docs = Array.from({ length: 10_001 }, (_, i) => ({ id: String(i), fields: { x: "y" } }));
      await expect(client.index({ resource: "tasks", documents: docs })).rejects.toThrow("documents exceeds maximum batch size");
    });

    it("rejects empty resource on remove", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.remove({ resource: "", ids: [] })).rejects.toThrow("resource must be a non-empty string");
    });

    it("rejects empty resource on clear", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.clear("")).rejects.toThrow("resource must be a non-empty string");
    });

    it("rejects limitPerResource exceeding max on searchAll", async () => {
      const client = createSearchClient({ adapter });
      await expect(
        client.searchAll({ query: "x", resources: ["a"], limitPerResource: 2000 }),
      ).rejects.toThrow("limitPerResource exceeds maximum");
    });

    it("rejects too many resources on searchAll", async () => {
      const client = createSearchClient({ adapter });
      const resources = Array.from({ length: 51 }, (_, i) => `r${i}`);
      await expect(client.searchAll({ query: "x", resources })).rejects.toThrow("resources exceeds maximum");
    });

    it("rejects invalid resource entries on searchAll", async () => {
      const client = createSearchClient({ adapter });
      await expect(client.searchAll({ query: "x", resources: ["tasks", ""] })).rejects.toThrow(
        "resource must be a non-empty string",
      );
    });

    it("validation errors have code and details", async () => {
      const client = createSearchClient({ adapter });
      try {
        await client.search({ resource: "tasks", query: "   " });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SearchClientValidationError);
        const err = e as SearchClientValidationError;
        expect(err.code).toBe("DFQL_INVALID");
        expect(err.details?.path).toBe("query");
      }
    });
  });

  describe("limit clamping", () => {
    it("clamps limit to MAX_LIMIT", async () => {
      const client = createSearchClient({ adapter });
      // limit 10_000 is the max, should pass validation and be clamped
      await client.search({ resource: "tasks", query: "x", limit: 10_000 });
      expect(adapter.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 10_000 }));
    });

    it("clamps searchAll limitPerResource to MAX_LIMIT_PER_RESOURCE", async () => {
      const client = createSearchClient({ adapter });
      await client.searchAll({ query: "x", resources: ["a"], limitPerResource: 1_000 });
      expect(adapter.searchAll).toHaveBeenCalledWith(
        expect.objectContaining({ limitPerResource: 1_000 }),
      );
    });

    it("applies default limits when not provided", async () => {
      const client = createSearchClient({ adapter });
      await client.searchAll({ query: "x", resources: ["a"] });
      expect(adapter.searchAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, limitPerResource: 10 }),
      );
    });
  });

  describe("searchAll fallback (no adapter.searchAll)", () => {
    it("falls back to per-resource search calls", async () => {
      const noSearchAllAdapter = createMockAdapter();
      delete (noSearchAllAdapter as any).searchAll;
      (noSearchAllAdapter.search as any).mockResolvedValueOnce(["a1", "a2"]);
      (noSearchAllAdapter.search as any).mockResolvedValueOnce(["b1"]);

      const client = createSearchClient({ adapter: noSearchAllAdapter });
      const results = await client.searchAll({
        query: "hello",
        resources: ["alpha", "beta"],
      });

      expect(noSearchAllAdapter.search).toHaveBeenCalledTimes(2);
      expect(results.length).toBe(3);
      // Verify deterministic ordering (score desc, resource asc, id asc)
      expect(results[0]).toEqual(expect.objectContaining({ resource: "alpha", id: "a1" }));
    });

    it("throws when adapter lacks searchAll and no resources provided", async () => {
      const noSearchAllAdapter = createMockAdapter();
      delete (noSearchAllAdapter as any).searchAll;

      const client = createSearchClient({ adapter: noSearchAllAdapter });
      await expect(client.searchAll({ query: "x" })).rejects.toThrow(
        "resources are required when adapter.searchAll is unavailable",
      );
    });
  });

  describe("deterministic sorting", () => {
    it("sorts searchAll results by score desc, resource asc, id asc", async () => {
      const mockResults: SearchAllResult[] = [
        { resource: "beta", id: "b1", score: 5 },
        { resource: "alpha", id: "a2", score: 5 },
        { resource: "alpha", id: "a1", score: 5 },
        { resource: "alpha", id: "a3", score: 10 },
      ];
      const sortAdapter = createMockAdapter({
        searchAll: vi.fn().mockResolvedValue(mockResults),
      });

      const client = createSearchClient({ adapter: sortAdapter });
      const results = await client.searchAll({ query: "x", resources: ["alpha", "beta"] });

      expect(results[0]).toEqual(expect.objectContaining({ id: "a3", score: 10 }));
      expect(results[1]).toEqual(expect.objectContaining({ resource: "alpha", id: "a1", score: 5 }));
      expect(results[2]).toEqual(expect.objectContaining({ resource: "alpha", id: "a2", score: 5 }));
      expect(results[3]).toEqual(expect.objectContaining({ resource: "beta", id: "b1", score: 5 }));
    });
  });
});
