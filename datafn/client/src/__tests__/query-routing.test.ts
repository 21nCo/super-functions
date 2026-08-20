import { describe, expect, it, vi } from "vitest";
import { time, type DatafnSchema } from "@datafn/core";
import { executeQuery } from "../query.js";
import { MemoryStorageAdapter } from "../adapters/memoryStorage.js";
import type { DatafnRemoteAdapter } from "../client.js";

const schema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [{ name: "title", type: "string", required: false }],
    },
    {
      name: "notes",
      version: 1,
      fields: [{ name: "body", type: "string", required: false }],
    },
  ],
  relations: [],
};

describe("Query routing", () => {
  it("executes batch queries locally when all resources are hydrated", async () => {
    const storage = new MemoryStorageAdapter(["tasks", "notes"]);
    await storage.upsertRecord("tasks", { id: "task:1", title: "Plan" });
    await storage.upsertRecord("notes", { id: "note:1", body: "Draft" });
    await storage.setHydrationState("tasks", "hydrating");
    await storage.setHydrationState("tasks", "ready");
    await storage.setHydrationState("notes", "hydrating");
    await storage.setHydrationState("notes", "ready");

    const remote: DatafnRemoteAdapter = {
      query: vi.fn().mockResolvedValue({ ok: true, result: [] }),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
    };

    const result = await executeQuery(
      remote,
      [
        { resource: "tasks", select: ["id", "title"] },
        { resource: "notes", select: ["id", "body"] },
      ],
      storage,
      [],
      schema,
    );

    expect(remote.query).not.toHaveBeenCalled();
    expect(result).toEqual([
      { data: [{ id: "task:1", title: "Plan" }], nextCursor: null },
      { data: [{ id: "note:1", body: "Draft" }], nextCursor: null },
    ]);
  });

  it("falls back to remote batch queries when a resource is not hydrated", async () => {
    const storage = new MemoryStorageAdapter(["tasks", "notes"]);
    await storage.setHydrationState("tasks", "hydrating");
    await storage.setHydrationState("tasks", "ready");

    const remote: DatafnRemoteAdapter = {
      query: vi.fn().mockResolvedValue({
        ok: true,
        result: [{ data: [{ id: "task:remote" }] }, { data: [{ id: "note:remote" }] }],
      }),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
    };

    const result = await executeQuery(
      remote,
      [
        { resource: "tasks", select: ["id"] },
        { resource: "notes", select: ["id"] },
      ],
      storage,
      [],
      schema,
    );

    expect(remote.query).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { data: [{ id: "task:remote" }] },
      { data: [{ id: "note:remote" }] },
    ]);
  });

  it("re-sorts and re-limits local overlays while preserving the remote envelope", async () => {
    const storage = new MemoryStorageAdapter(["tasks"]);
    await storage.upsertRecord("tasks", { id: "task:local-a", title: "Alpha" });
    await storage.upsertRecord("tasks", { id: "task:local-b", title: "Bravo" });
    await storage.setHydrationState("tasks", "hydrating");

    const remote: DatafnRemoteAdapter = {
      query: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          data: [{ id: "task:remote-z", title: "Zulu" }],
          nextCursor: "next-page",
          count: 20,
        },
      }),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
    };

    const result = await executeQuery(
      remote,
      { resource: "tasks", select: ["id", "title"], sort: ["title:asc"], limit: 2 },
      storage,
      [],
      schema,
    );

    expect(result).toEqual({
      data: [
        { id: "task:local-a", title: "Alpha" },
        { id: "task:local-b", title: "Bravo" },
      ],
      nextCursor: "next-page",
      count: 20,
    });
  });

  it("does not overlay local rows onto offset or cursor pages", async () => {
    const storage = new MemoryStorageAdapter(["tasks"]);
    await storage.upsertRecord("tasks", { id: "task:local", title: "Local" });
    await storage.setHydrationState("tasks", "hydrating");
    const remoteResult = {
      data: [{ id: "task:remote-page", title: "Remote page" }],
      nextCursor: "next-page",
    };
    const remote: DatafnRemoteAdapter = {
      query: vi.fn().mockResolvedValue({ ok: true, result: remoteResult }),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
    };

    await expect(executeQuery(
      remote,
      { resource: "tasks", offset: 10, limit: 10 },
      storage,
      [],
      schema,
    )).resolves.toEqual(remoteResult);
    await expect(executeQuery(
      remote,
      { resource: "tasks", sort: ["id:asc"], cursor: { after: { id: "task:10" } } },
      storage,
      [],
      schema,
    )).resolves.toEqual(remoteResult);
  });

  it("preserves local overlays for zero offsets and no-op cursors", async () => {
    const storage = new MemoryStorageAdapter(["tasks"]);
    await storage.upsertRecord("tasks", { id: "task:local", title: "Local" });
    await storage.setHydrationState("tasks", "hydrating");
    const remote: DatafnRemoteAdapter = {
      query: vi.fn().mockResolvedValue({
        ok: true,
        result: { data: [{ id: "task:remote", title: "Remote" }] },
      }),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
    };
    const expected = {
      data: [
        { id: "task:remote", title: "Remote" },
        { id: "task:local", title: "Local" },
      ],
    };

    await expect(executeQuery(
      remote,
      { resource: "tasks", offset: 0 },
      storage,
      [],
      schema,
    )).resolves.toEqual(expected);
    await expect(executeQuery(
      remote,
      { resource: "tasks", cursor: null } as any,
      storage,
      [],
      schema,
    )).resolves.toEqual(expected);
    await expect(executeQuery(
      remote,
      { resource: "tasks", cursor: {} },
      storage,
      [],
      schema,
    )).resolves.toEqual(expected);
  });

  it("masks remotely stale rows changed by pending local mutations", async () => {
    const storage = new MemoryStorageAdapter(["tasks"]);
    await storage.upsertRecord("tasks", { id: "task:changed", title: "Done" });
    await storage.changelogAppend({
      clientId: "client:1",
      mutationId: "mutation:changed",
      timestampMs: 1,
      mutation: {
        operation: "merge",
        resource: "tasks",
        id: "task:changed",
        record: { title: "Done" },
      },
    });
    await storage.changelogAppend({
      clientId: "client:1",
      mutationId: "mutation:deleted",
      timestampMs: 2,
      mutation: {
        operation: "delete",
        resource: "tasks",
        id: "task:deleted",
      },
    });
    await storage.setHydrationState("tasks", "hydrating");

    const remote: DatafnRemoteAdapter = {
      query: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          data: [
            { id: "task:changed", title: "Open" },
            { id: "task:deleted", title: "Open" },
            { id: "task:untouched", title: "Open" },
          ],
          nextCursor: null,
        },
      }),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
    };

    const result = await executeQuery(
      remote,
      {
        resource: "tasks",
        select: ["id", "title"],
        filters: { title: "Open" },
      },
      storage,
      [],
      schema,
    );

    expect(result).toEqual({
      data: [{ id: "task:untouched", title: "Open" }],
      nextCursor: null,
    });
  });

  it("returns an aggregate envelope for impossible temporal grouping filters", async () => {
    const remote: DatafnRemoteAdapter = {
      query: vi.fn(),
      mutation: vi.fn(),
      transact: vi.fn(),
      seed: vi.fn(),
      clone: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      reconcile: vi.fn(),
    };

    const result = await executeQuery(
      remote,
      {
        resource: "tasks",
        filters: { id: { $in: [] } },
        temporal: time.groupByDay("createdAt", { alias: "day" }),
      },
      undefined,
      [],
      schema,
    );

    expect(result).toEqual({ groups: [], nextCursor: null });
    expect(remote.query).not.toHaveBeenCalled();
  });
});
