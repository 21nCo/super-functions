import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatafnClient } from "../client.js";
import { DefaultHttpTransport } from "../transport/http.js";
import { MemoryStorageAdapter } from "../adapters/memoryStorage.js";

const schema: any = {
  resources: [
    {
      name: "todos",
      version: 1,
      idPrefix: "todo:",
      capabilities: ["trash", "archivable"],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "logs",
      version: 1,
      idPrefix: "log:",
      fields: [{ name: "message", type: "string" as const, required: true }],
    },
  ],
  relations: [],
};

const capabilitySchema: any = {
  capabilities: ["timestamps", "audit"],
  resources: [
    {
      name: "todos",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
  relations: [],
};

describe("Client capability methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes trash/restore/archive/unarchive only on capability-enabled resources", async () => {
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: { ok: true, mutationId: "m", affectedIds: ["x"], deduped: false },
    });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    expect(typeof client.todos.trash).toBe("function");
    expect(typeof client.todos.restore).toBe("function");
    expect(typeof client.todos.archive).toBe("function");
    expect(typeof client.todos.unarchive).toBe("function");

    expect(client.logs.trash).toBeUndefined();
    expect(client.logs.restore).toBeUndefined();
    expect(client.logs.archive).toBeUndefined();
    expect(client.logs.unarchive).toBeUndefined();
  });

  it("trash/restore/archive/unarchive send correct DFQL operations", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m", affectedIds: ["todo:1"], deduped: false },
      });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.todos.trash!("todo:1");
    await client.todos.restore!("todo:1");
    await client.todos.archive!("todo:1");
    await client.todos.unarchive!("todo:1");

    expect(mutationSpy).toHaveBeenNthCalledWith(1, {
      resource: "todos",
      version: 1,
      operation: "trash",
      id: "todo:1",
    });
    expect(mutationSpy).toHaveBeenNthCalledWith(2, {
      resource: "todos",
      version: 1,
      operation: "restore",
      id: "todo:1",
    });
    expect(mutationSpy).toHaveBeenNthCalledWith(3, {
      resource: "todos",
      version: 1,
      operation: "archive",
      id: "todo:1",
    });
    expect(mutationSpy).toHaveBeenNthCalledWith(4, {
      resource: "todos",
      version: 1,
      operation: "unarchive",
      id: "todo:1",
    });
  });

  it("delete remains hard delete operation", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m", affectedIds: ["todo:1"], deduped: false },
      });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.todos.delete("todo:1");

    expect(mutationSpy).toHaveBeenCalledWith({
      resource: "todos",
      version: 1,
      operation: "delete",
      id: "todo:1",
    });
  });

  it("query metadata includeTrashed/includeArchived is passed through", async () => {
    const querySpy = vi.spyOn(DefaultHttpTransport.prototype, "query").mockResolvedValue({
      ok: true,
      result: { data: [], nextCursor: null },
    });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.todos.query({
      select: ["id"],
      metadata: { includeTrashed: true, includeArchived: true },
    });

    expect(querySpy).toHaveBeenCalledWith({
      resource: "todos",
      version: 1,
      select: ["id"],
      metadata: { includeTrashed: true, includeArchived: true },
    });
  });

  it("offline local handling updates trash/archive fields and delete removes record", async () => {
    const storage = new MemoryStorageAdapter(["todos", "logs"]);
    const client = createDatafnClient({
      schema,
      sync: { mode: "local-only", offlinability: true },
      storage,
      clientId: "client:1",
      getTimestamp: () => 1234,
    });

    await client.todos.mutate({
      operation: "insert",
      id: "todo:1",
      record: { title: "a" },
    });

    await client.todos.trash!("todo:1");
    let row = await storage.getRecord("todos", "todo:1");
    expect(row?.trashedAt).toBe(1234);
    expect(row?.trashedBy).toBeNull();

    await client.todos.restore!("todo:1");
    row = await storage.getRecord("todos", "todo:1");
    expect(row?.trashedAt).toBeNull();
    expect(row?.trashedBy).toBeNull();

    await client.todos.archive!("todo:1");
    row = await storage.getRecord("todos", "todo:1");
    expect(row?.isArchived).toBe(true);

    await client.todos.unarchive!("todo:1");
    row = await storage.getRecord("todos", "todo:1");
    expect(row?.isArchived).toBe(false);

    await client.todos.delete("todo:1");
    row = await storage.getRecord("todos", "todo:1");
    expect(row).toBeNull();
  });

  it("local-first injects capability fields optimistically but strips them from changelog mutations", async () => {
    const storage = new MemoryStorageAdapter(["todos"]);
    const client = createDatafnClient({
      schema: capabilitySchema,
      sync: { mode: "local-only", offlinability: true },
      storage,
      clientId: "client:cap",
      getTimestamp: () => 777,
    });

    await client.todos.mutate({
      operation: "insert",
      id: "todo:cap",
      record: {
        title: "a",
        createdAt: new Date(1),
        updatedAt: new Date(1),
        createdBy: "spoof",
        updatedBy: "spoof",
      },
    });

    const row = await storage.getRecord("todos", "todo:cap");
    expect(row?.createdAt).toBe(777);
    expect(row?.updatedAt).toBe(777);
    expect(row?.createdBy).toBe("client:cap");
    expect(row?.updatedBy).toBe("client:cap");

    const pending = await storage.changelogList();
    expect(pending.length).toBe(1);
    const record = pending[0].mutation.record as Record<string, unknown>;
    expect(record.createdAt).toBeUndefined();
    expect(record.updatedAt).toBeUndefined();
    expect(record.createdBy).toBeUndefined();
    expect(record.updatedBy).toBeUndefined();
    expect(record.title).toBe("a");
  });

  it("strips readonly capability fields from outbound mutation payloads", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m-cap", affectedIds: ["todo:1"], deduped: false },
      });

    const client = createDatafnClient({
      schema: capabilitySchema,
      sync: { remote: "http://example.com" },
      clientId: "client:cap",
    });

    await client.todos.mutate({
      operation: "insert",
      id: "todo:1",
      record: {
        title: "x",
        createdAt: new Date(1),
        updatedAt: new Date(1),
        createdBy: "spoof",
        updatedBy: "spoof",
      },
    });

    expect(mutationSpy).toHaveBeenCalledTimes(1);
    const payload = mutationSpy.mock.calls[0][0] as Record<string, any>;
    expect(payload.record.title).toBe("x");
    expect(payload.record.createdAt).toBeUndefined();
    expect(payload.record.updatedAt).toBeUndefined();
    expect(payload.record.createdBy).toBeUndefined();
    expect(payload.record.updatedBy).toBeUndefined();
  });
});
