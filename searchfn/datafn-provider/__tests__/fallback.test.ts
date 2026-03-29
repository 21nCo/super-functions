import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { createSearchProvider } from "../src/index";

function makeAdapterWithoutSearchAll(
  searchFn?: (params: { resource: string; query: string; limit?: number }) => Promise<string[]>,
): SearchAdapter {
  return {
    name: "no-searchall",
    index: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockImplementation(searchFn ?? (() => Promise.resolve([]))),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

// TV-FALL-001
describe("searchAll fallback — adapter without native searchAll", () => {
  it("calls adapter.search per resource and merges results", async () => {
    const searchFn = vi.fn().mockImplementation(({ resource }: { resource: string }) =>
      Promise.resolve(resource === "tasks" ? ["t1", "t2"] : ["n1"]),
    );
    const adapter: SearchAdapter = {
      name: "no-searchall",
      index: vi.fn().mockResolvedValue(undefined),
      search: searchFn,
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"], notes: ["content"] },
    });

    const results = await provider.searchAll({ query: "hello" });

    expect(searchFn).toHaveBeenCalledWith(expect.objectContaining({ resource: "tasks", query: "hello" }));
    expect(searchFn).toHaveBeenCalledWith(expect.objectContaining({ resource: "notes", query: "hello" }));

    const ids = results.map((r) => r.id);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).toContain("n1");
  });

  it("results have resource, id (string), and numeric score", async () => {
    const adapter = makeAdapterWithoutSearchAll(() => Promise.resolve(["x1"]));
    const provider = createSearchProvider(adapter, {
      resourceFields: { items: ["title"] },
    });

    const results = await provider.searchAll({ query: "test" });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.resource).toBe("string");
      expect(typeof r.id).toBe("string");
      expect(typeof r.score).toBe("number");
    }
  });

  it("uses resources from params when provided instead of resourceFields keys", async () => {
    const searchFn = vi.fn().mockResolvedValue(["doc1"]);
    const adapter: SearchAdapter = {
      name: "no-searchall",
      index: vi.fn().mockResolvedValue(undefined),
      search: searchFn,
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"] },
    });

    await provider.searchAll({ query: "x", resources: ["projects"] });

    const calledResources = searchFn.mock.calls.map((c) => c[0].resource);
    expect(calledResources).toContain("projects");
    expect(calledResources).not.toContain("tasks");
  });

  it("sorts results by score DESC, resource ASC, id ASC", async () => {
    const searchFn = vi.fn().mockImplementation(({ resource }: { resource: string }) => {
      if (resource === "alpha") return Promise.resolve(["z", "a"]);
      if (resource === "beta") return Promise.resolve(["b"]);
      return Promise.resolve([]);
    });
    const adapter: SearchAdapter = {
      name: "no-searchall",
      index: vi.fn().mockResolvedValue(undefined),
      search: searchFn,
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const provider = createSearchProvider(adapter, {
      resourceFields: { alpha: ["title"], beta: ["title"] },
    });

    const results = await provider.searchAll({ query: "test", limitPerResource: 50 });

    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev.score === curr.score) {
        if (prev.resource === curr.resource) {
          expect(prev.id <= curr.id).toBe(true);
        } else {
          expect(prev.resource <= curr.resource).toBe(true);
        }
      } else {
        expect(prev.score).toBeGreaterThan(curr.score);
      }
    }
  });

  it("global limit trims final result set", async () => {
    const adapter = makeAdapterWithoutSearchAll(() =>
      Promise.resolve(["1", "2", "3", "4", "5"]),
    );
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"], notes: ["title"] },
    });

    const results = await provider.searchAll({ query: "x", limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("forwards AbortSignal to adapter.search fallback calls", async () => {
    const searchFn = vi.fn().mockResolvedValue(["doc1"]);
    const adapter: SearchAdapter = {
      name: "no-searchall",
      index: vi.fn().mockResolvedValue(undefined),
      search: searchFn,
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"] },
    });

    const controller = new AbortController();
    await provider.searchAll({ query: "x", signal: controller.signal });

    expect(searchFn).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

// TV-FALL-002
describe("searchAll fallback — respects limitPerResource", () => {
  it("passes limitPerResource as limit to each adapter.search call", async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const adapter: SearchAdapter = {
      name: "no-searchall",
      index: vi.fn().mockResolvedValue(undefined),
      search: searchFn,
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"], notes: ["content"] },
    });

    await provider.searchAll({ query: "x", limitPerResource: 5 });

    for (const call of searchFn.mock.calls) {
      expect(call[0].limit).toBe(5);
    }
  });

  it("assigns synthetic scores based on position within limitPerResource", async () => {
    const adapter = makeAdapterWithoutSearchAll(() =>
      Promise.resolve(["id0", "id1", "id2"]),
    );
    const provider = createSearchProvider(adapter, {
      resourceFields: { items: ["title"] },
    });

    const results = await provider.searchAll({ query: "x", limitPerResource: 10 });

    expect(results[0].score).toBe(10);
    expect(results[1].score).toBe(9);
    expect(results[2].score).toBe(8);
  });

  it("defaults limitPerResource to 50 when not provided", async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const adapter: SearchAdapter = {
      name: "no-searchall",
      index: vi.fn().mockResolvedValue(undefined),
      search: searchFn,
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"] },
    });

    await provider.searchAll({ query: "x" });

    expect(searchFn).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });
});

// TV-FALL-003
describe("searchAll fallback — no resolvable resources throws DFQL_INVALID", () => {
  it("throws when adapter lacks searchAll and no resources are resolvable", async () => {
    const adapter = makeAdapterWithoutSearchAll();
    const provider = createSearchProvider(adapter);

    await expect(provider.searchAll({ query: "x" })).rejects.toMatchObject({
      code: "DFQL_INVALID",
    });
  });

  it("throws with descriptive message", async () => {
    const adapter = makeAdapterWithoutSearchAll();
    const provider = createSearchProvider(adapter);

    await expect(provider.searchAll({ query: "x" })).rejects.toThrow(
      "resources are required when adapter.searchAll is unavailable",
    );
  });

  it("throws when explicit empty resources array is passed", async () => {
    const adapter = makeAdapterWithoutSearchAll();
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"] },
    });

    await expect(provider.searchAll({ query: "x", resources: [] })).rejects.toMatchObject({
      code: "DFQL_INVALID",
    });
  });

  it("does not throw when adapter has native searchAll", async () => {
    const adapter: SearchAdapter = {
      name: "with-searchall",
      index: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      searchAll: vi.fn().mockResolvedValue([]),
    };
    const provider = createSearchProvider(adapter);

    await expect(provider.searchAll({ query: "x" })).resolves.toEqual([]);
  });
});
