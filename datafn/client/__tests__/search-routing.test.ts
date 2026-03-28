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

describe("TV-CLI-003: client.search() routing semantics", () => {
  it("defaults to local-first in source=auto when local search provider exists", async () => {
    const remoteSearch = vi.fn().mockResolvedValue({ ok: true, result: { results: [] } });
    const remote = makeRemoteAdapter(remoteSearch);
    const localProvider: any = {
      name: "local",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue([{ resource: "tasks", id: "t1", score: 0.9 }]),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };

    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "routing-auto-local-first",
      searchProvider: localProvider,
    });

    const result: any = await client.search({ query: "task", source: "auto" });
    expect(localProvider.searchAll).toHaveBeenCalledTimes(1);
    expect(remoteSearch).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ id: "t1", resource: "tasks" });
  });

  it("falls back to remote in auto mode when no local provider exists", async () => {
    const remoteResult = { results: [{ id: "t2", resource: "tasks", score: 0.5, data: {} }] };
    const remoteSearch = vi.fn().mockResolvedValue({ ok: true, result: remoteResult });
    const remote = makeRemoteAdapter(remoteSearch);

    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "routing-auto-remote",
    });

    const result = await client.search({ query: "task" });
    expect(remoteSearch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, result: remoteResult });
  });

  it("uses remote when source=remote even if local provider exists", async () => {
    const remoteResult = { results: [{ id: "t3", resource: "tasks", score: 0.6, data: {} }] };
    const remoteSearch = vi.fn().mockResolvedValue({ ok: true, result: remoteResult });
    const remote = makeRemoteAdapter(remoteSearch);
    const localProvider: any = {
      name: "local",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue([{ resource: "tasks", id: "t1", score: 0.9 }]),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };

    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "routing-force-remote",
      searchProvider: localProvider,
    });

    const result = await client.search({ query: "task", source: "remote" });
    expect(remoteSearch).toHaveBeenCalledTimes(1);
    expect(localProvider.searchAll).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, result: remoteResult });
  });

  it("fails source=local when no local provider is available", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "routing-local-unavailable",
    });

    await expect(client.search({ query: "task", source: "local" })).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      message: "Local search unavailable",
      details: { path: "source" },
    });
  });

  it("fails source=remote when remote search is unavailable", async () => {
    const localProvider: any = {
      name: "local",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue([{ resource: "tasks", id: "t1", score: 0.9 }]),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };
    const client = createDatafnClient({
      schema,
      sync: { mode: "local-only" },
      clientId: "routing-remote-unavailable",
      searchProvider: localProvider,
    });

    await expect(client.search({ query: "task", source: "remote" })).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      message: "Remote search unavailable",
      details: { path: "source" },
    });
  });

  it("fails invalid source with DFQL_INVALID", async () => {
    const remote = makeRemoteAdapter(vi.fn().mockResolvedValue({ ok: true, result: { results: [] } }));
    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: remote },
      clientId: "routing-invalid-source",
    });

    await expect(client.search({ query: "task", source: "edge" as "auto" })).rejects.toMatchObject({
      code: "DFQL_INVALID",
      details: { path: "source" },
    });
  });
});
