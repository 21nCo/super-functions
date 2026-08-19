import { describe, expect, it, vi } from "vitest";
import type { DatafnSchema } from "@datafn/core";
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
});
