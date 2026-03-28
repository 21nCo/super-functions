import { describe, it, expect, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [{ name: "title", type: "string" as const }],
    },
  ],
};

function makeRemoteAdapter(searchImpl?: (p: unknown) => Promise<unknown>) {
  return {
    query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
    mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, mutationId: "m", affectedIds: [], errors: [], deduped: false } }),
    transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, results: [] } }),
    seed: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    clone: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    pull: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    push: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    reconcile: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    ...(searchImpl ? { search: searchImpl } : {}),
  };
}

describe("TV-XCLI-001: client.search() — proxies to remote adapter when sync configured", () => {
  it("calls remote.search with params when search method exists", async () => {
    const mockResult = { results: [{ id: "t1", resource: "tasks", score: 0.9, data: {} }] };
    const searchFn = vi.fn().mockResolvedValue({ ok: true, result: mockResult });
    const remote = makeRemoteAdapter(searchFn);

    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-client",
    });

    const result = await client.search({ query: "hello" });

    expect(searchFn).toHaveBeenCalledWith(
      expect.objectContaining({ query: "hello", limit: 50, limitPerResource: 50 }),
    );
    expect(result).toEqual({ ok: true, result: mockResult });
  });

  it("throws DFQL_UNSUPPORTED when remote adapter has no search method", async () => {
    const remote = makeRemoteAdapter();

    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-client",
    });

    await expect(client.search({ query: "test" })).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
    });
  });
});

describe("TV-XCLI-002: client.search() with remote URL", () => {
  it("calls search via DefaultHttpTransport URL", async () => {
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remote: "http://example.com/datafn" },
      clientId: "test-client",
    });

    expect(typeof client.search).toBe("function");
  });
});

describe("TV-OFFL-001: client.search() offline — uses searchProvider.searchAll", () => {
  it("uses searchProvider.searchAll in local-only mode", async () => {
    const { MemoryStorageAdapter } = await import("../src/adapters/memoryStorage.js");
    const storage = new MemoryStorageAdapter();
    await storage.upsertRecord("tasks", { id: "t1", title: "task one" });

    const candidates = [{ resource: "tasks", id: "t1", score: 0.8 }];
    const searchProvider: any = {
      name: "offline-provider",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue(candidates),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };

    const client = createDatafnClient({
      schema,
      sync: { mode: "local-only" },
      storage,
      clientId: "test-offline",
      searchProvider,
    });

    const result: any = await client.search({ query: "task" });

    expect(searchProvider.searchAll).toHaveBeenCalledWith(
      expect.objectContaining({ query: "task" }),
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("t1");
    expect(result.results[0].data.id).toBe("t1");
  });
});

describe("TV-USEC-001: client.search() — throws when no remote and no searchProvider.searchAll", () => {
  it("throws DFQL_UNSUPPORTED without any search capability", async () => {
    const { MemoryStorageAdapter } = await import("../src/adapters/memoryStorage.js");

    const client = createDatafnClient({
      schema,
      sync: { mode: "local-only" },
      storage: new MemoryStorageAdapter(),
      clientId: "test-no-search",
    });

    await expect(client.search({ query: "test" })).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      message: "Search unavailable offline without search provider",
    });
  });
});

describe("TV-ABRT-001: client.search() — throws after destroy()", () => {
  it("throws when client is destroyed", async () => {
    const searchFn = vi.fn().mockResolvedValue({ ok: true, result: { results: [] } });
    const remote = makeRemoteAdapter(searchFn);

    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-destroy",
    });

    await client.destroy();

    await expect(client.search({ query: "test" })).rejects.toMatchObject({
      code: "DFQL_INVALID",
    });
  });
});

describe("TV-ERR-001: canonical search validation/client errors", () => {
  it("rejects empty query with canonical message", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-empty",
    });

    await expect(client.search({ query: "   " })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Search query must not be empty",
    });
  });

  it("rejects too-long query with LIMIT_EXCEEDED", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-long",
    });

    await expect(client.search({ query: "x".repeat(1001) })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
      message: "Search query exceeds maximum length",
    });
  });

  it("rejects aborted signal with DFQL_ABORTED", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-abort",
    });

    const controller = new AbortController();
    controller.abort();

    await expect(client.search({ query: "task", signal: controller.signal })).rejects.toMatchObject({
      code: "DFQL_ABORTED",
      message: "Search request aborted",
    });
  });

  it("rejects non-boolean prefix with canonical path", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-prefix",
    });

    await expect(client.search({ query: "task", prefix: 1 as unknown as boolean })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Invalid request: prefix must be boolean",
      details: { path: "prefix" },
    });
  });

  it("rejects invalid fuzzy values", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-fuzzy",
    });

    await expect(client.search({ query: "task", fuzzy: "auto" as unknown as boolean })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      details: { path: "fuzzy" },
    });
    await expect(client.search({ query: "task", fuzzy: -1 })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      details: { path: "fuzzy" },
    });
  });

  it("rejects invalid fieldBoosts shapes and values", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-fieldboosts",
    });

    await expect(client.search({ query: "task", fieldBoosts: [] as unknown as Record<string, number> })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      details: { path: "fieldBoosts" },
    });
    await expect(client.search({ query: "task", fieldBoosts: { title: 0 } })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      details: { path: "fieldBoosts.title" },
    });
  });

  it("rejects too many fieldBoost entries with LIMIT_EXCEEDED", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-fieldboosts-cap",
    });

    const fieldBoosts: Record<string, number> = {};
    for (let i = 0; i < 101; i += 1) {
      fieldBoosts[`f${i}`] = i + 1;
    }

    await expect(client.search({ query: "task", fieldBoosts })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
      details: { path: "fieldBoosts" },
    });
  });
});

describe("TV-CLI-002: client.search() forwards advanced search options", () => {
  it("forwards prefix/fuzzy/fieldBoosts to local search provider unchanged", async () => {
    const { MemoryStorageAdapter } = await import("../src/adapters/memoryStorage.js");
    const storage = new MemoryStorageAdapter();
    await storage.upsertRecord("tasks", { id: "t1", title: "task one" });

    const candidates = [{ resource: "tasks", id: "t1", score: 0.8 }];
    const searchProvider: any = {
      name: "offline-provider",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue(candidates),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };

    const client = createDatafnClient({
      schema,
      sync: { mode: "local-only" },
      storage,
      clientId: "test-forward-local",
      searchProvider,
    });

    await client.search({
      query: "task",
      prefix: true,
      fuzzy: 0.3,
      fieldBoosts: { title: 2 },
    });

    expect(searchProvider.searchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "task",
        prefix: true,
        fuzzy: 0.3,
        fieldBoosts: { title: 2 },
      }),
    );
  });

  it("forwards prefix/fuzzy/fieldBoosts to remote.search unchanged", async () => {
    const searchFn = vi.fn().mockResolvedValue({ ok: true, result: { results: [] } });
    const remote = makeRemoteAdapter(searchFn);
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-forward-remote",
    });

    await client.search({
      query: "task",
      prefix: true,
      fuzzy: true,
      fieldBoosts: { title: 2 },
      source: "remote",
    });

    expect(searchFn).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "task",
        prefix: true,
        fuzzy: true,
        fieldBoosts: { title: 2 },
      }),
    );
  });

  it("keeps omitted options undefined in forwarded payloads", async () => {
    const searchFn = vi.fn().mockResolvedValue({ ok: true, result: { results: [] } });
    const remote = makeRemoteAdapter(searchFn);
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "test-forward-undefined",
    });

    await client.search({ query: "task", source: "remote" });
    const payload = searchFn.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.prefix).toBeUndefined();
    expect(payload.fuzzy).toBeUndefined();
    expect(payload.fieldBoosts).toBeUndefined();
  });
});

describe("PROV-008/009: client search provider lifecycle", () => {
  it("calls initialize on startup and dispose on destroy", async () => {
    const { MemoryStorageAdapter } = await import("../src/adapters/memoryStorage.js");
    const initialize = vi.fn().mockResolvedValue(undefined);
    const dispose = vi.fn().mockResolvedValue(undefined);
    const searchProvider: any = {
      name: "lifecycle-provider",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue([]),
      updateIndices: vi.fn().mockResolvedValue(undefined),
      initialize,
      dispose,
    };

    const client = createDatafnClient({
      schema,
      sync: { mode: "local-only" },
      storage: new MemoryStorageAdapter(),
      clientId: "test-lifecycle",
      searchProvider,
    });

    await client.search({ query: "task" });
    expect(initialize).toHaveBeenCalledTimes(1);

    await client.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
