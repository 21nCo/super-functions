import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { createSearchProvider } from "../src/index";

function makeAdapter(overrides?: Partial<SearchAdapter>): SearchAdapter {
  return {
    name: "mock",
    index: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// TV-PROV-004
describe("createSearchProvider — factory creates valid SearchProvider", () => {
  it("returns an object with all required SearchProvider methods", () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter);

    expect(typeof provider.name).toBe("string");
    expect(typeof provider.search).toBe("function");
    expect(typeof provider.updateIndices).toBe("function");
    expect(typeof provider.searchAll).toBe("function");
    expect(typeof provider.initialize).toBe("function");
    expect(typeof provider.dispose).toBe("function");
  });

  it("name getter delegates to adapter.name", () => {
    const adapter = makeAdapter({ name: "custom-adapter" });
    const provider = createSearchProvider(adapter);
    expect(provider.name).toBe("custom-adapter");
  });

  it("factory does not modify the adapter instance", () => {
    const adapter = makeAdapter();
    const originalKeys = Object.keys(adapter);
    const originalName = adapter.name;

    createSearchProvider(adapter);

    expect(Object.keys(adapter)).toEqual(originalKeys);
    expect(adapter.name).toBe(originalName);
  });

  it("multiple providers from same adapter are independent", () => {
    const adapter = makeAdapter();
    const p1 = createSearchProvider(adapter, { resourceFields: { tasks: ["title"] } });
    const p2 = createSearchProvider(adapter, { resourceFields: { notes: ["content"] } });
    expect(p1).not.toBe(p2);
  });
});

// TV-PROV-005
describe("createSearchProvider — search delegates to adapter.search", () => {
  let adapter: SearchAdapter;

  beforeEach(() => {
    adapter = makeAdapter({
      search: vi.fn().mockResolvedValue(["doc-1", "doc-2"]),
    });
  });

  it("returns string IDs from adapter.search result", async () => {
    const provider = createSearchProvider(adapter);
    const result = await provider.search({ resource: "tasks", query: "hello" });
    expect(result).toEqual(["doc-1", "doc-2"]);
  });

  it("passes resource and query to adapter.search", async () => {
    const provider = createSearchProvider(adapter);
    await provider.search({ resource: "notes", query: "report" });
    expect(adapter.search).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "notes", query: "report" }),
    );
  });

  it("defaults limit to 50 when not provided", async () => {
    const provider = createSearchProvider(adapter);
    await provider.search({ resource: "tasks", query: "x" });
    expect(adapter.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("uses provided limit when specified", async () => {
    const provider = createSearchProvider(adapter);
    await provider.search({ resource: "tasks", query: "x", limit: 10 });
    expect(adapter.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it("converts numeric DocId results to strings", async () => {
    (adapter.search as ReturnType<typeof vi.fn>).mockResolvedValue([1, 2, 3]);
    const provider = createSearchProvider(adapter);
    const result = await provider.search({ resource: "tasks", query: "x" });
    expect(result).toEqual(["1", "2", "3"]);
  });

  it("forwards AbortSignal to adapter.search", async () => {
    const provider = createSearchProvider(adapter);
    const controller = new AbortController();
    await provider.search({
      resource: "tasks",
      query: "x",
      signal: controller.signal,
    });
    expect(adapter.search).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe("createSearchProvider — updateIndices", () => {
  it("calls adapter.remove on delete operation", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter);
    await provider.updateIndices({
      resource: "tasks",
      records: [{ id: "1" }, { id: "2" }],
      operation: "delete",
    });
    expect(adapter.remove).toHaveBeenCalledWith({ resource: "tasks", ids: ["1", "2"] });
    expect(adapter.index).not.toHaveBeenCalled();
  });

  it("stringifies delete ids before delegating to adapter.remove", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter);
    await provider.updateIndices({
      resource: "tasks",
      records: [{ id: 1 }, { id: 2 }],
      operation: "delete",
    });
    expect(adapter.remove).toHaveBeenCalledWith({ resource: "tasks", ids: ["1", "2"] });
  });

  it("calls adapter.index on upsert operation", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"] },
    });
    await provider.updateIndices({
      resource: "tasks",
      records: [{ id: "1", title: "Hello" }],
      operation: "upsert",
    });
    expect(adapter.index).toHaveBeenCalledWith({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "Hello" }, metadata: {} }],
    });
  });

  it("converts non-string field values to strings", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter);
    await provider.updateIndices({
      resource: "tasks",
      records: [{ id: "1", count: 42, active: true, meta: { x: 1 } }],
      operation: "upsert",
    });
    expect(adapter.index).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [
          {
            id: "1",
            fields: { count: "42", active: "true", meta: '{"x":1}' },
            metadata: {},
          },
        ],
      }),
    );
  });

  it("uses configured resourceFields when extracting indexed fields", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter, {
      resourceFields: { tasks: ["title"] },
    });

    await provider.updateIndices({
      resource: "tasks",
      records: [{ id: "1", title: "Hello", body: "Ignored" }],
      operation: "upsert",
    });

    expect(adapter.index).toHaveBeenCalledWith({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "Hello" }, metadata: {} }],
    });
  });

  it("falls back to String(value) when JSON serialization fails", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter);
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await provider.updateIndices({
      resource: "tasks",
      records: [{ id: "1", meta: circular }],
      operation: "upsert",
    });

    expect(adapter.index).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [{ id: "1", fields: { meta: "[object Object]" }, metadata: {} }],
      }),
    );
  });
});

describe("createSearchProvider — searchAll native delegation", () => {
  it("forwards AbortSignal to adapter.searchAll when available", async () => {
    const searchAll = vi.fn().mockResolvedValue([]);
    const adapter = makeAdapter({ searchAll });
    const provider = createSearchProvider(adapter);
    const controller = new AbortController();

    await provider.searchAll({
      query: "hello",
      resources: ["tasks"],
      signal: controller.signal,
    });

    expect(searchAll).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe("createSearchProvider — initialize and dispose delegation", () => {
  it("initialize delegates to adapter.initialize when present", async () => {
    const initFn = vi.fn().mockResolvedValue(undefined);
    const adapter = makeAdapter({ initialize: initFn });
    const provider = createSearchProvider(adapter);
    const config = { resources: [{ name: "tasks", searchFields: ["title"] }] };
    await provider.initialize(config);
    expect(initFn).toHaveBeenCalledWith(config);
  });

  it("initialize is a no-op when adapter lacks initialize", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter);
    await expect(
      provider.initialize({ resources: [{ name: "tasks", searchFields: ["title"] }] }),
    ).resolves.toBeUndefined();
  });

  it("dispose delegates to adapter.dispose when present", async () => {
    const disposeFn = vi.fn().mockResolvedValue(undefined);
    const adapter = makeAdapter({ dispose: disposeFn });
    const provider = createSearchProvider(adapter);
    await provider.dispose();
    expect(disposeFn).toHaveBeenCalled();
  });

  it("dispose is a no-op when adapter lacks dispose", async () => {
    const adapter = makeAdapter();
    const provider = createSearchProvider(adapter);
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});

// TV-DFP-001: provider forwards fuzzy, prefix, fieldBoosts to adapter.search
describe("createSearchProvider — TV-DFP-001: forwards search options to adapter.search", () => {
  it("forwards fuzzy, prefix, and fieldBoosts from params to adapter.search", async () => {
    const searchSpy = vi.fn().mockResolvedValue([]);
    const adapter = makeAdapter({ search: searchSpy });
    const provider = createSearchProvider(adapter);

    await provider.search({
      resource: "todos",
      query: "to",
      fuzzy: true,
      prefix: true,
      fieldBoosts: { title: 2 },
    } as any);

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "todos",
        query: "to",
        fuzzy: true,
        prefix: true,
        fieldBoosts: { title: 2 },
      }),
    );
  });

  it("forwards undefined options when not provided (no accidental overrides)", async () => {
    const searchSpy = vi.fn().mockResolvedValue([]);
    const adapter = makeAdapter({ search: searchSpy });
    const provider = createSearchProvider(adapter);

    await provider.search({ resource: "todos", query: "hello" } as any);

    const call = searchSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.fuzzy).toBeUndefined();
    expect(call.prefix).toBeUndefined();
    expect(call.fieldBoosts).toBeUndefined();
  });
});

// TV-DFP-002: provider forwards fuzzy, prefix, fieldBoosts to adapter.searchAll
describe("createSearchProvider — TV-DFP-002: forwards search options to adapter.searchAll", () => {
  it("forwards fuzzy, prefix, and fieldBoosts to native adapter.searchAll", async () => {
    const searchAllSpy = vi.fn().mockResolvedValue([]);
    const adapter = makeAdapter({ searchAll: searchAllSpy });
    const provider = createSearchProvider(adapter);

    await provider.searchAll({
      query: "to",
      resources: ["todos"],
      fuzzy: true,
      prefix: true,
    } as any);

    expect(searchAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "to",
        fuzzy: true,
        prefix: true,
      }),
    );
  });

  it("forwards fuzzy and prefix to fallback per-resource search when searchAll unavailable", async () => {
    const searchSpy = vi.fn().mockResolvedValue([]);
    const adapter = makeAdapter({ search: searchSpy });
    // No searchAll on this adapter
    const provider = createSearchProvider(adapter, { resourceFields: { todos: ["title"] } });

    await provider.searchAll({
      query: "to",
      resources: ["todos"],
      fuzzy: true,
      prefix: true,
    } as any);

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "todos",
        query: "to",
        fuzzy: true,
        prefix: true,
      }),
    );
  });

  it("continues fallback searchAll results when one resource search fails", async () => {
    const searchSpy = vi.fn()
      .mockResolvedValueOnce(["a1"])
      .mockRejectedValueOnce(new Error("boom"));
    const adapter = makeAdapter({ search: searchSpy });
    delete (adapter as Partial<SearchAdapter>).searchAll;
    const provider = createSearchProvider(adapter, {
      resourceFields: { alpha: ["title"], beta: ["title"] },
    });

    const results = await provider.searchAll({
      query: "to",
      resources: ["alpha", "beta"],
    } as any);

    expect(results).toEqual([{ resource: "alpha", id: "a1", score: 50 }]);
  });
});
