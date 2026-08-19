import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";

const schema: DatafnSchema = {
  resources: [
    {
      name: "todos",
      version: 1,
      idPrefix: "todo",
      capabilities: ["timestamps", "audit", "trash", "archivable"] as any,
      fields: [
        { name: "text", type: "string", required: true },
        { name: "rank", type: "number", required: false },
        { name: "children", type: "array", required: false },
      ],
    },
  ],
  relations: [],
};

describe("sync push capability injection", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;

  const push = async (mutations: Array<Record<string, unknown>>) => {
    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client:1", mutations }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    return { res, body };
  };

  const pullLegacy = async (cursor = "0") => {
    const req = new Request("http://localhost/datafn/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client:2", cursor, limit: 50 }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    return body.result;
  };

  beforeEach(async () => {
    actorId = "user:alice";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      schema,
      database: db,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:1",
        getActorId: () => actorId as any,
      },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("push insert injects timestamps and audit fields", async () => {
    const start = Date.now();

    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m1",
        id: "todo:1",
        record: { text: "hello" },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:1" }],
      namespace: "ns:1",
    });

    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdAt).toBeGreaterThanOrEqual(start);
    expect(row.updatedAt).toBeGreaterThanOrEqual(start);
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
  });

  it("push treats identical duplicate inserts as idempotent and rejects divergent duplicates", async () => {
    const first = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-insert-idempotent-first",
        id: "todo:insert-idempotent",
        record: { text: "same", children: [] },
      },
    ]);

    expect(first.res.status).toBe(200);
    expect(first.body.result.ok).toBe(true);
    await db.update({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:insert-idempotent" }],
      data: { children: ["todo:child"] },
      namespace: "ns:1",
    });

    const second = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-insert-idempotent-second",
        id: "todo:insert-idempotent",
        record: { text: "same", children: [] },
      },
    ]);

    expect(second.res.status).toBe(200);
    expect(second.body.result.ok).toBe(true);
    expect(second.body.result.applied).toContain("m-insert-idempotent-second");
    expect(second.body.result.errors).toHaveLength(0);

    const divergent = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-insert-idempotent-divergent",
        id: "todo:insert-idempotent",
        record: { text: "different" },
      },
    ]);

    expect(divergent.res.status).toBe(400);
    expect(divergent.body.error.code).toBe("CONFLICT");

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:insert-idempotent" }],
      namespace: "ns:1",
    });

    expect(row.text).toBe("same");
  });

  it("push treats existing duplicate inserts with number-like database values as idempotent", async () => {
    const wrappedDbBase = memoryAdapter();
    await wrappedDbBase.initialize();
    const wrappedServer = await createDatafnServer({
      schema,
      database: wrappedDbBase,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:wrapped",
        getActorId: () => "user:alice",
      },
    });
    const sendWrappedPush = async (
      mutationId: string,
      text: string,
      rank: number,
    ) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:wrapped",
          mutations: [
            {
              resource: "todos",
              version: 1,
              operation: "insert",
              clientId: "client:wrapped",
              mutationId,
              id: "todo:wrapped-duplicate",
              record: { text, rank },
            },
          ],
        }),
      });
      const res = await wrappedServer.router.handle(req, {});
      const body = await res.json();
      return { res, body };
    };

    try {
      const seeded = await sendWrappedPush(
        "wrapped-duplicate-seed",
        "same",
        1000,
      );
      expect(seeded.res.status).toBe(200);
      await wrappedDbBase.update({
        model: "todos",
        where: [
          { field: "id", operator: "eq", value: "todo:wrapped-duplicate" },
        ],
        data: { rank: "1000" },
        namespace: "ns:wrapped",
      });

      const duplicate = await sendWrappedPush(
        "wrapped-duplicate-same",
        "same",
        1000,
      );
      expect(duplicate.res.status).toBe(200);
      expect(duplicate.body.result.ok).toBe(true);
      expect(duplicate.body.result.applied).toContain("wrapped-duplicate-same");
      expect(duplicate.body.result.errors).toHaveLength(0);

      const divergent = await sendWrappedPush(
        "wrapped-duplicate-different",
        "different",
        1000,
      );
      expect(divergent.res.status).toBe(400);
      expect(divergent.body.error.code).toBe("CONFLICT");
    } finally {
      await wrappedServer.close();
    }
  });

  it("push maps wrapped duplicate insert races to conflict", async () => {
    const raceDbBase = memoryAdapter();
    await raceDbBase.initialize();
    const raceDb = new Proxy(raceDbBase, {
      get(target, property, receiver) {
        if (property === "create") {
          return async (params: any) => {
            if (
              params.model === "todos" &&
              params.data?.id === "todo:race-duplicate"
            ) {
              const cause = {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "todos_pkey"',
              };
              throw new Error('Failed query: insert into "todos"', { cause });
            }
            return target.create(params);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const raceServer = await createDatafnServer({
      schema,
      database: raceDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:race",
        getActorId: () => "user:alice",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:race",
          mutations: [
            {
              resource: "todos",
              version: 1,
              operation: "insert",
              clientId: "client:race",
              mutationId: "race-duplicate",
              id: "todo:race-duplicate",
              record: { text: "same" },
            },
          ],
        }),
      });
      const res = await raceServer.router.handle(req, {});
      const body = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toBe("Record already exists");
    } finally {
      await raceServer.close();
    }
  });

  it("re-evaluates cached insert id conflicts when the duplicate becomes idempotent", async () => {
    const seeded = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "cached-insert-seed",
        id: "todo:cached-insert-conflict",
        record: { text: "same", children: [] },
      },
    ]);
    expect(seeded.res.status).toBe(200);

    await db.update({
      model: "todos",
      where: [
        { field: "id", operator: "eq", value: "todo:cached-insert-conflict" },
      ],
      data: { children: ["todo:child"] },
      namespace: "ns:1",
    });

    const conflict = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "cached-insert-conflict",
        id: "todo:cached-insert-conflict",
        record: { text: "different", children: [] },
      },
    ]);
    expect(conflict.res.status).toBe(400);
    expect(conflict.body.error.code).toBe("CONFLICT");

    const stored = await db.internal.findOne("__datafn_idempotency", [
      { field: "namespace", op: "eq", value: "datafn" },
      { field: "client_id", op: "eq", value: "client:1" },
      { field: "mutation_id", op: "eq", value: "cached-insert-conflict" },
    ]);
    if (!stored) {
      throw new Error("expected cached insert conflict idempotency result");
    }
    const storedResult = JSON.parse(stored.result as string);
    storedResult.errors[0].retryable = false;
    await db.internal.update(
      "__datafn_idempotency",
      [
        { field: "namespace", op: "eq", value: "datafn" },
        { field: "client_id", op: "eq", value: "client:1" },
        { field: "mutation_id", op: "eq", value: "cached-insert-conflict" },
      ],
      {
        result: JSON.stringify(storedResult),
      },
    );

    const retried = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "cached-insert-conflict",
        id: "todo:cached-insert-conflict",
        record: { text: "same", children: [] },
      },
    ]);
    expect(retried.res.status).toBe(200);
    expect(retried.body.result.ok).toBe(true);
    expect(retried.body.result.applied).toContain("cached-insert-conflict");

    const storedAfter = await db.internal.findOne("__datafn_idempotency", [
      { field: "namespace", op: "eq", value: "datafn" },
      { field: "client_id", op: "eq", value: "client:1" },
      { field: "mutation_id", op: "eq", value: "cached-insert-conflict" },
    ]);
    const storedAfterResult = JSON.parse(storedAfter.result as string);
    expect(storedAfterResult.ok).toBe(true);
  });

  it("push merge creates missing record with insert capability fields", async () => {
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        clientId: "client:1",
        mutationId: "m-merge-create",
        id: "todo:merge-create",
        record: { text: "created by merge" },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.applied).toContain("m-merge-create");
    expect(body.result.errors).toHaveLength(0);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:merge-create" }],
      namespace: "ns:1",
    });

    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
  });

  it("push merge creates missing records with schema defaults", async () => {
    const captureSchema: DatafnSchema = {
      resources: [
        {
          name: "captures",
          version: 1,
          idPrefix: "capture",
          fields: [
            { name: "id", type: "string", required: true },
            {
              name: "method",
              type: "string",
              required: true,
              default: "MARKDOWN",
            },
            {
              name: "childrenWithStructure",
              type: "array",
              required: true,
              default: [],
            },
            {
              name: "rootStructure",
              type: "array",
              required: true,
              default: [],
            },
            { name: "refreshId", type: "number", required: true, default: 0 },
            { name: "body", type: "json", required: false },
          ],
        },
      ],
      relations: [],
    };
    const captureDb = memoryAdapter();
    await captureDb.initialize();
    const captureServer = await createDatafnServer({
      schema: captureSchema,
      database: captureDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:capture-defaults",
        getActorId: () => "user:alice",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:capture-defaults",
          mutations: [
            {
              resource: "captures",
              version: 1,
              operation: "merge",
              clientId: "client:capture-defaults",
              mutationId: "capture-merge-create",
              id: "capture:defaults",
              record: {
                id: "capture:defaults",
                body: { blocks: [] },
              },
            },
          ],
        }),
      });
      const res = await captureServer.router.handle(req);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(body.result.applied).toContain("capture-merge-create");

      const row = await captureDb.findOne({
        model: "captures",
        where: [{ field: "id", operator: "eq", value: "capture:defaults" }],
        namespace: "ns:capture-defaults",
      });

      expect(row).toMatchObject({
        id: "capture:defaults",
        method: "MARKDOWN",
        childrenWithStructure: [],
        rootStructure: [],
        refreshId: 0,
      });
    } finally {
      await captureServer.close();
    }
  });

  it("re-evaluates cached not found push failures when a merge becomes valid", async () => {
    const captureSchema: DatafnSchema = {
      resources: [
        {
          name: "captures",
          version: 1,
          idPrefix: "capture",
          fields: [
            { name: "id", type: "string", required: true },
            { name: "method", type: "string", required: true },
            { name: "refreshId", type: "number", required: true },
          ],
        },
      ],
      relations: [],
    };
    const captureDb = memoryAdapter();
    await captureDb.initialize();
    const captureServer = await createDatafnServer({
      schema: captureSchema,
      database: captureDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:not-found-retry",
        getActorId: () => "user:alice",
      },
    });
    const sendPush = async (record: Record<string, unknown>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:not-found-retry",
          mutations: [
            {
              resource: "captures",
              version: 1,
              operation: "merge",
              clientId: "client:not-found-retry",
              mutationId: "merge-after-not-found",
              id: "capture:not-found-retry",
              record,
            },
          ],
        }),
      });
      const res = await captureServer.router.handle(req);
      const body = (await res.json()) as any;
      return { res, body };
    };

    try {
      const first = await sendPush({ id: "capture:not-found-retry" });
      expect(first.res.status).toBe(400);
      expect(first.body.error.code).toBe("NOT_FOUND");

      const stored = await captureDb.internal.findOne("__datafn_idempotency", [
        { field: "namespace", op: "eq", value: "datafn" },
        { field: "client_id", op: "eq", value: "client:not-found-retry" },
        { field: "mutation_id", op: "eq", value: "merge-after-not-found" },
      ]);
      if (!stored) {
        throw new Error("expected cached not found idempotency result");
      }
      const storedResult = JSON.parse(stored.result as string);
      storedResult.errors[0].retryable = false;
      await captureDb.internal.update(
        "__datafn_idempotency",
        [
          { field: "namespace", op: "eq", value: "datafn" },
          { field: "client_id", op: "eq", value: "client:not-found-retry" },
          { field: "mutation_id", op: "eq", value: "merge-after-not-found" },
        ],
        {
          result: JSON.stringify(storedResult),
        },
      );

      const second = await sendPush({
        id: "capture:not-found-retry",
        method: "MARKDOWN",
        refreshId: 1,
      });
      expect(second.res.status).toBe(200);
      expect(second.body.ok).toBe(true);
      expect(second.body.result.ok).toBe(true);
      expect(second.body.result.applied).toContain("merge-after-not-found");
    } finally {
      await captureServer.close();
    }
  });

  it("push merge creates missing record when adapter update resolves without affecting a row", async () => {
    db.capabilities.operations.strictUpdateNotFound = true;
    const originalUpdate = db.update.bind(db);
    db.update = async (params: any) => {
      const idFilter = params.where?.find((item: any) => item.field === "id");
      if (idFilter?.value === "todo:strict-noop") return undefined;
      return originalUpdate(params);
    };

    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        clientId: "client:1",
        mutationId: "m-merge-strict-noop",
        id: "todo:strict-noop",
        record: { text: "created despite no-op update" },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.applied).toContain("m-merge-strict-noop");
    expect(body.result.errors).toHaveLength(0);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:strict-noop" }],
      namespace: "ns:1",
    });

    expect(row?.text).toBe("created despite no-op update");
    expect(row?.createdBy).toBe("user:alice");
  });

  it("push mutation execution failure is surfaced as a failed response", async () => {
    const originalCreate = db.create.bind(db);
    db.create = async (params: any) => {
      if (params.model === "todos") {
        throw new Error("synthetic mutation failure");
      }
      return originalCreate(params);
    };

    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-mutation-failure",
        id: "todo:mutation-failure",
        record: { text: "should not be acked" },
      },
    ]);

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("MUTATION_FAILED");
    expect(body.error.details.path).toBe("mutations[m-mutation-failure]");
    expect(body.result.ok).toBe(false);
    expect(body.result.errors).toEqual([
      expect.objectContaining({
        mutationId: "m-mutation-failure",
        code: "MUTATION_FAILED",
        retryable: true,
      }),
    ]);
  });

  it("retries a cached mutation execution failure", async () => {
    const originalCreate = db.create.bind(db);
    let shouldFail = true;
    db.create = async (params: any) => {
      if (
        params.model === "todos" &&
        params.data?.id === "todo:retry-once" &&
        shouldFail
      ) {
        shouldFail = false;
        throw new Error("synthetic transient mutation failure");
      }
      return originalCreate(params);
    };

    const mutation = {
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-retry-once",
      id: "todo:retry-once",
      record: { text: "eventually applied" },
    };

    const first = await push([mutation]);
    expect(first.res.status).toBe(400);
    expect(first.body.error.code).toBe("MUTATION_FAILED");

    const second = await push([mutation]);
    expect(second.res.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.result.ok).toBe(true);
    expect(second.body.result.applied).toContain("m-retry-once");

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:retry-once" }],
      namespace: "ns:1",
    });

    expect(row?.text).toBe("eventually applied");
  });

  it("push treats missing deletes as idempotent before adapter delete", async () => {
    const originalDelete = db.delete.bind(db);
    let deleteCalls = 0;
    db.delete = async (params: any) => {
      if (params.model === "todos") {
        deleteCalls += 1;
        throw new Error("Record not found: todo:missing-delete");
      }
      return originalDelete(params);
    };

    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "delete",
        clientId: "client:1",
        mutationId: "m-missing-delete",
        id: "todo:missing-delete",
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.applied).toContain("m-missing-delete");
    expect(body.result.errors).toHaveLength(0);
    expect(deleteCalls).toBe(0);
  });

  it("push merge updates existing record and preserves createdAt", async () => {
    await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-merge-existing-seed",
        id: "todo:merge-existing",
        record: { text: "before" },
      },
    ]);

    const before = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:merge-existing" }],
      namespace: "ns:1",
    });

    await push([
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        clientId: "client:1",
        mutationId: "m-merge-existing",
        id: "todo:merge-existing",
        record: { text: "after" },
      },
    ]);

    const after = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:merge-existing" }],
      namespace: "ns:1",
    });

    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    expect(after.text).toBe("after");
  });

  it("push trash executes and records pull-visible merge change with full record", async () => {
    await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m2",
        id: "todo:2",
        record: { text: "trash me" },
      },
    ]);

    actorId = "user:bob";
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "trash",
        clientId: "client:1",
        mutationId: "m3",
        id: "todo:2",
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:2" }],
      namespace: "ns:1",
    });
    expect(typeof row.trashedAt).toBe("number");
    expect(row.trashedBy).toBe("user:bob");

    const pullResult = await pullLegacy("0");
    const mergeChange = pullResult.changes
      .filter((change: any) => change.id === "todo:2" && change.op === "upsert")
      .at(-1);
    expect(mergeChange).toBeDefined();
    expect(mergeChange.record.text).toBe("trash me");
    expect(mergeChange.record.trashedBy).toBe("user:bob");
    expect(mergeChange.record.trashedAt).not.toBeNull();
  });

  it("push archive executes and records merge change", async () => {
    await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m4",
        id: "todo:3",
        record: { text: "archive me" },
      },
    ]);

    actorId = "user:carol";
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "archive",
        clientId: "client:1",
        mutationId: "m5",
        id: "todo:3",
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:3" }],
      namespace: "ns:1",
    });
    expect(row.isArchived).toBe(true);

    const pullResult = await pullLegacy("0");
    const mergeChange = pullResult.changes
      .filter((change: any) => change.id === "todo:3" && change.op === "upsert")
      .at(-1);
    expect(mergeChange).toBeDefined();
    expect(mergeChange.record.isArchived).toBe(true);
    expect(mergeChange.record.text).toBe("archive me");
  });

  it("push with invalid operation is rejected", async () => {
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "invalidOp",
        clientId: "client:1",
        mutationId: "m6",
        id: "todo:4",
      },
    ]);

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNSUPPORTED");
  });

  it("push returns retryability metadata in HTTP 400 results for terminal mutation failures", async () => {
    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            resource: "todos",
            version: 1,
            operation: "insert",
            clientId: "client:other",
            mutationId: "m-client-mismatch",
            id: "todo:client-mismatch",
            record: { text: "should not apply" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatchObject({
      code: "DFQL_INVALID",
      details: { path: "mutations[0].clientId" },
    });
    expect(body.result).toMatchObject({
      ok: false,
      applied: [],
      errors: [
        expect.objectContaining({
          mutationId: "m-client-mismatch",
          code: "DFQL_INVALID",
          path: "mutations[0].clientId",
          retryable: false,
        }),
      ],
    });
  });

  it("push insert strips client-provided readonly capability fields before validation", async () => {
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m7",
        id: "todo:readonly",
        record: {
          text: "ignore readonly input",
          createdAt: 1,
          updatedAt: 2,
          createdBy: "spoof",
          updatedBy: "spoof",
          trashedAt: 3,
          trashedBy: "spoof",
        },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:readonly" }],
      namespace: "ns:1",
    });
    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
    expect(row.trashedAt).toBeUndefined();
    expect(row.trashedBy).toBeUndefined();
  });

  it("does not strip similarly named fields when capability is not enabled", async () => {
    const noCapabilitySchema: DatafnSchema = {
      resources: [
        {
          name: "plain",
          version: 1,
          fields: [
            { name: "text", type: "string", required: true },
            { name: "createdAt", type: "number", required: false },
          ],
        },
      ],
      relations: [],
    };

    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer = await createDatafnServer({
      schema: noCapabilitySchema,
      database: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:plain",
        getActorId: () => "user:plain",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:plain",
          mutations: [
            {
              resource: "plain",
              version: 1,
              operation: "insert",
              clientId: "client:plain",
              mutationId: "m8",
              id: "plain:1",
              record: { text: "ok", createdAt: 42 },
            },
          ],
        }),
      });
      const res = await localServer.router.handle(req);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);

      const row = await localDb.findOne({
        model: "plain",
        where: [{ field: "id", operator: "eq", value: "plain:1" }],
        namespace: "ns:plain",
      });
      expect(row.createdAt).toBe(42);
    } finally {
      await localServer.close();
    }
  });

  it("push merge does not inject timestamp fields when capability is not enabled", async () => {
    const noCapabilitySchema: DatafnSchema = {
      resources: [
        {
          name: "plainMerge",
          version: 1,
          fields: [{ name: "text", type: "string", required: false }],
        },
      ],
      relations: [],
    };

    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer = await createDatafnServer({
      schema: noCapabilitySchema,
      database: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:plain-merge",
        getActorId: () => "user:plain",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:plain-merge",
          mutations: [
            {
              resource: "plainMerge",
              version: 1,
              operation: "merge",
              clientId: "client:plain-merge",
              mutationId: "m-plain-merge",
              id: "plainMerge:1",
              record: { text: "ok" },
            },
          ],
        }),
      });
      const res = await localServer.router.handle(req);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(body.result.errors).toHaveLength(0);

      const row = await localDb.findOne({
        model: "plainMerge",
        where: [{ field: "id", operator: "eq", value: "plainMerge:1" }],
        namespace: "ns:plain-merge",
      });
      expect(row.text).toBe("ok");
      expect(row.createdAt).toBeUndefined();
      expect(row.updatedAt).toBeUndefined();
    } finally {
      await localServer.close();
    }
  });

  it("push executes share and unshare with permissions change tracking semantics", async () => {
    const shareSchema: DatafnSchema = {
      capabilities: ["audit"] as any,
      resources: [
        {
          name: "docs",
          version: 1,
          fields: [{ name: "title", type: "string", required: true }],
          capabilities: [
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
              },
            },
          ] as any,
        },
      ],
      relations: [],
    };

    const shareDb = memoryAdapter();
    await shareDb.initialize();
    const shareServer = await createDatafnServer({
      schema: shareSchema,
      database: shareDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:share",
        getActorId: () => "user:owner",
      },
    });

    const pushRequest = async (mutations: Array<Record<string, unknown>>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:share", mutations }),
      });
      const res = await shareServer.router.handle(req);
      const body = (await res.json()) as any;
      return { res, body };
    };

    try {
      const inserted = await pushRequest([
        {
          resource: "docs",
          version: 1,
          operation: "insert",
          id: "doc:1",
          clientId: "client:share",
          mutationId: "s1",
          record: { title: "spec" },
        },
      ]);
      expect(inserted.res.status).toBe(200);
      expect(inserted.body.ok).toBe(true);

      const shared = await pushRequest([
        {
          resource: "docs",
          version: 1,
          operation: "share",
          id: "doc:1",
          clientId: "client:share",
          mutationId: "s2",
          shareWith: { userId: "user:viewer", level: "viewer" },
        },
      ]);
      expect(shared.res.status).toBe(200);
      expect(shared.body.ok).toBe(true);
      expect(shared.body.result.ok).toBe(true);
      expect(shared.body.result.errors).toHaveLength(0);

      const permissionAfterShare = await shareDb.findOne({
        model: "__datafn_permissions_global",
        where: [
          {
            field: "id",
            operator: "eq",
            value: "docs:ns:share:doc:1:user:viewer",
          },
        ],
        namespace: "ns:share",
      });
      expect(permissionAfterShare).not.toBeNull();

      const unshared = await pushRequest([
        {
          resource: "docs",
          version: 1,
          operation: "unshare",
          id: "doc:1",
          clientId: "client:share",
          mutationId: "s3",
          shareWith: { userId: "user:viewer" },
        },
      ]);
      expect(unshared.res.status).toBe(200);
      expect(unshared.body.ok).toBe(true);
      expect(unshared.body.result.ok).toBe(true);
      expect(unshared.body.result.errors).toHaveLength(0);

      const permissionAfterUnshare = await shareDb.findOne({
        model: "__datafn_permissions_global",
        where: [
          {
            field: "id",
            operator: "eq",
            value: "docs:ns:share:doc:1:user:viewer",
          },
        ],
        namespace: "ns:share",
      });
      expect(permissionAfterUnshare).toBeNull();
    } finally {
      await shareServer.close();
    }
  });

  it("push treats missing private shareable deletes as idempotent", async () => {
    const shareSchema: DatafnSchema = {
      capabilities: ["audit"] as any,
      resources: [
        {
          name: "captures",
          version: 1,
          fields: [{ name: "body", type: "json", required: false }],
          capabilities: [
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
              },
            },
          ] as any,
        },
      ],
      relations: [],
    };

    const shareDb = memoryAdapter();
    await shareDb.initialize();
    const shareServer = await createDatafnServer({
      schema: shareSchema,
      database: shareDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:share-delete",
        getActorId: () => "user:owner",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:share-delete",
          mutations: [
            {
              resource: "captures",
              version: 1,
              operation: "delete",
              id: "capture:missing",
              clientId: "client:share-delete",
              mutationId: "delete-missing",
            },
          ],
        }),
      });
      const res = await shareServer.router.handle(req);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(body.result.applied).toContain("delete-missing");
      expect(body.result.errors).toHaveLength(0);
    } finally {
      await shareServer.close();
    }
  });

  it("push lets a namespace owner delete a legacy private shareable record without createdBy", async () => {
    const shareSchema: DatafnSchema = {
      capabilities: ["audit"] as any,
      resources: [
        {
          name: "captures",
          version: 1,
          fields: [{ name: "body", type: "json", required: false }],
          capabilities: [
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
              },
            },
          ] as any,
        },
      ],
      relations: [],
    };
    const namespace = "user:owner";

    const shareDb = memoryAdapter();
    await shareDb.initialize();
    await shareDb.create({
      model: "captures",
      data: { id: "capture:legacy", body: { text: "legacy" } },
      namespace,
    });
    const shareServer = await createDatafnServer({
      schema: shareSchema,
      database: shareDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => "owner",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:share-delete",
          mutations: [
            {
              resource: "captures",
              version: 1,
              operation: "delete",
              id: "capture:legacy",
              clientId: "client:share-delete",
              mutationId: "delete-legacy",
            },
          ],
        }),
      });
      const res = await shareServer.router.handle(req);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(body.result.applied).toContain("delete-legacy");
      expect(body.result.errors).toHaveLength(0);
    } finally {
      await shareServer.close();
    }
  });

  it("re-evaluates cached forbidden push failures when authorization changes", async () => {
    const shareSchema: DatafnSchema = {
      capabilities: ["audit"] as any,
      resources: [
        {
          name: "captures",
          version: 1,
          fields: [{ name: "body", type: "json", required: false }],
          capabilities: [
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
              },
            },
          ] as any,
        },
      ],
      relations: [],
    };
    const namespace = "user:owner";
    let actorId = "owner";

    const shareDb = memoryAdapter();
    await shareDb.initialize();
    const shareServer = await createDatafnServer({
      schema: shareSchema,
      database: shareDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => namespace,
        getActorId: () => actorId,
      },
    });

    const sendPush = async (
      clientId: string,
      mutations: Array<Record<string, unknown>>,
    ) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          mutations,
        }),
      });
      const res = await shareServer.router.handle(req);
      const body = (await res.json()) as any;
      return { res, body };
    };
    const mutation = {
      resource: "captures",
      version: 1,
      operation: "delete",
      id: "capture:auth-change",
      clientId: "client:auth-change",
      mutationId: "delete-after-auth-change",
    };

    try {
      const seeded = await sendPush("client:auth-seed", [
        {
          resource: "captures",
          version: 1,
          operation: "insert",
          id: "capture:auth-change",
          clientId: "client:auth-seed",
          mutationId: "seed-auth-change",
          record: { body: { text: "legacy" } },
        },
      ]);
      expect(seeded.res.status).toBe(200);
      expect(seeded.body.result.ok).toBe(true);

      actorId = "other";
      const first = await sendPush("client:auth-change", [mutation]);
      expect(first.res.status).toBe(400);
      expect(first.body.error.code).toBe("FORBIDDEN");

      const stored = await shareDb.internal.findOne("__datafn_idempotency", [
        { field: "namespace", op: "eq", value: "datafn" },
        { field: "client_id", op: "eq", value: "client:auth-change" },
        { field: "mutation_id", op: "eq", value: "delete-after-auth-change" },
      ]);
      if (!stored) {
        throw new Error("expected cached forbidden idempotency result");
      }
      const storedResult = JSON.parse(stored.result as string);
      storedResult.errors[0].retryable = false;
      await shareDb.internal.update(
        "__datafn_idempotency",
        [
          { field: "namespace", op: "eq", value: "datafn" },
          { field: "client_id", op: "eq", value: "client:auth-change" },
          { field: "mutation_id", op: "eq", value: "delete-after-auth-change" },
        ],
        {
          result: JSON.stringify(storedResult),
        },
      );

      actorId = "owner";
      const second = await sendPush("client:auth-change", [mutation]);
      expect(second.res.status).toBe(200);
      expect(second.body.ok).toBe(true);
      expect(second.body.result.ok).toBe(true);
      expect(second.body.result.applied).toContain("delete-after-auth-change");
      expect(second.body.result.errors).toHaveLength(0);
    } finally {
      await shareServer.close();
    }
  });
});
