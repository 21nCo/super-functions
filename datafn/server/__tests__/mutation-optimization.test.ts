/**
 * Phase 05: Mutation Optimization tests
 * TV-MUT-UPSERT-001, TV-MUT-UPSERT-002, TV-MUT-INSERT-001, TV-MUT-INSERT-002, TV-MUT-PUSH-001
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      idPrefix: "task",
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "status", type: "string" as const, required: false },
        { name: "priority", type: "number" as const, required: false },
      ],
    },
  ],
  relations: [],
};

describe("Phase 05: Mutation Optimization", () => {
  let server: any;
  let db: any;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({ allowUnknownResources: true, schema, db });
  });

  describe("MUT-001: Merge uses update (not upsert)", () => {
    it("TV-MUT-UPSERT-001: merge on non-existent record creates when required fields are present", async () => {
      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          version: "1",
          clientId: "client-1",
          mutationId: "mut-upsert-create",
          operation: "merge",
          id: "task-new-upsert",
          record: { title: "Created via upsert", status: "pending" },
        }),
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);

      const created = await db.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task-new-upsert" }],
      });
      expect(created).toBeDefined();
      expect(created.title).toBe("Created via upsert");
      expect(created.status).toBe("pending");
    });

    it("TV-MUT-UPSERT-002: merge updates existing record via upsert", async () => {
      // Seed existing record
      await db.create({
        model: "tasks",
        data: { id: "task-existing", title: "Original", status: "pending", priority: 1 },
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          version: "1",
          clientId: "client-1",
          mutationId: "mut-upsert-update",
          operation: "merge",
          id: "task-existing",
          record: { status: "done" },
        }),
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);

      // Verify record was updated (merge semantics: only specified fields change)
      const record = await db.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task-existing" }],
      });
      expect(record).toBeDefined();
      expect(record.title).toBe("Original"); // Unchanged
      expect(record.status).toBe("done"); // Updated
      expect(record.priority).toBe(1); // Unchanged
    });

    it("TV-MUT-MRG-STRICT-001: merge update skips fallback read when adapter has strict update not-found", async () => {
      await db.create({
        model: "tasks",
        data: { id: "task-strict-update", title: "Original", status: "pending" },
      });
      const findOneSpy = vi.spyOn(db, "findOne");

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          version: "1",
          clientId: "client-1",
          mutationId: "mut-strict-update",
          operation: "merge",
          id: "task-strict-update",
          record: { status: "done" },
        }),
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(db.capabilities.operations.strictUpdateNotFound).toBe(true);
      const mergeFallbackReads = findOneSpy.mock.calls.filter(([params]) =>
        params?.model === "tasks" &&
        Array.isArray(params?.where) &&
        params.where.some((c: any) => c?.field === "id" && c?.operator === "eq" && c?.value === "task-strict-update"),
      );
      expect(mergeFallbackReads).toHaveLength(0);

      findOneSpy.mockRestore();
      const record = await db.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task-strict-update" }],
      });
      expect(record.status).toBe("done");
    });
  });

  describe("MUT-002: Insert without findOne pre-check", () => {
    it("TV-MUT-INSERT-001: insert succeeds without findOne call", async () => {
      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          version: "1",
          clientId: "client-1",
          mutationId: "mut-direct-insert",
          operation: "insert",
          id: "task-direct",
          record: { title: "Direct insert" },
        }),
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);

      // Verify record was created
      const record = await db.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task-direct" }],
      });
      expect(record).toBeDefined();
      expect(record.title).toBe("Direct insert");
    });

    it("TV-MUT-INSERT-002: insert conflict detected from create error", async () => {
      // Seed existing record
      await db.create({
        model: "tasks",
        data: { id: "task-conflict", title: "Original" },
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          version: "1",
          clientId: "client-1",
          mutationId: "mut-conflict",
          operation: "insert",
          id: "task-conflict",
          record: { title: "Duplicate" },
        }),
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();

      // EXEC-002: Single mutation CONFLICT returns HTTP 409 with top-level error
      expect(res.status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("CONFLICT");

      // Verify original record is unchanged
      const record = await db.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task-conflict" }],
      });
      expect(record.title).toBe("Original");
    });
  });

  describe("MUT-003: Push merge uses upsert", () => {
    it("TV-MUT-PUSH-001: push merge updates existing record and returns NOT_FOUND when create is ineligible", async () => {
      // Seed existing record
      await db.create({
        model: "tasks",
        data: { id: "task-push-exist", title: "Before push", status: "pending" },
      });

      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "client-push",
          mutations: [
            {
              clientId: "client-push",
              mutationId: "mut-push-merge-new",
              operation: "merge",
              resource: "tasks",
              id: "task-push-new",
              record: { status: "pending" },
            },
            {
              clientId: "client-push",
              mutationId: "mut-push-merge-exist",
              operation: "merge",
              resource: "tasks",
              id: "task-push-exist",
              record: { status: "done" },
            },
          ],
        }),
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      // Merge on non-existent record returns NOT_FOUND error
      expect(body.result.applied).toContain("mut-push-merge-exist");
      expect(body.result.applied).not.toContain("mut-push-merge-new");
      expect(body.result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ mutationId: "mut-push-merge-new", code: "NOT_FOUND" }),
        ]),
      );

      // Verify existing record updated (merge semantics)
      const existRecord = await db.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task-push-exist" }],
      });
      expect(existRecord).toBeDefined();
      expect(existRecord.title).toBe("Before push"); // Unchanged
      expect(existRecord.status).toBe("done"); // Updated
    });

    it("TV-MUT-PUSH-STRICT-001: push merge update skips fallback read when adapter has strict update not-found", async () => {
      await db.create({
        model: "tasks",
        data: { id: "task-push-strict", title: "Before push", status: "pending" },
      });
      const findOneSpy = vi.spyOn(db, "findOne");

      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "client-push",
          mutations: [
            {
              clientId: "client-push",
              mutationId: "mut-push-strict",
              operation: "merge",
              resource: "tasks",
              id: "task-push-strict",
              record: { status: "done" },
            },
          ],
        }),
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(body.result.applied).toContain("mut-push-strict");
      expect(db.capabilities.operations.strictUpdateNotFound).toBe(true);
      const mergeFallbackReads = findOneSpy.mock.calls.filter(([params]) =>
        params?.model === "tasks" &&
        Array.isArray(params?.where) &&
        params.where.some((c: any) => c?.field === "id" && c?.operator === "eq" && c?.value === "task-push-strict"),
      );
      expect(mergeFallbackReads).toHaveLength(0);

      findOneSpy.mockRestore();
      const record = await db.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task-push-strict" }],
      });
      expect(record.status).toBe("done");
    });
  });

  describe("BATCH-CHG-002: Batch delta recording for relation mutations", () => {
    const relSchema: DatafnSchema = {
      resources: [
        {
          name: "tasks",
          version: 1,
          idPrefix: "task",
          fields: [{ name: "title", type: "string" as const, required: true }],
        },
        {
          name: "tags",
          version: 1,
          idPrefix: "tag",
          fields: [{ name: "name", type: "string" as const, required: true }],
        },
      ],
      relations: [
        {
          from: "tasks",
          relation: "tags",
          to: "tags",
          type: "many-many",
        },
      ],
    };

    let relServer: any;
    let relDb: any;

    beforeEach(async () => {
      relDb = memoryAdapter();
      await relDb.initialize();
      await relDb.create({ model: "tasks", data: { id: "task-1", title: "Task 1" }, namespace: "datafn" });
      await relDb.create({ model: "tags", data: { id: "tag-1", name: "Tag 1" }, namespace: "datafn" });
      await relDb.create({ model: "tags", data: { id: "tag-2", name: "Tag 2" }, namespace: "datafn" });
      relServer = await createDatafnServer({ allowUnknownResources: true, schema: relSchema, db: relDb });
    });

    it("TV-BATCH-CHG-003: batch seq allocation for relation mutations (1 meta update for 2 join deltas)", async () => {
      const metaCreateSpy = vi.spyOn(relDb.internal, "create");
      const metaUpdateSpy = vi.spyOn(relDb.internal, "update");

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          version: "1",
          clientId: "client-1",
          mutationId: "mut-batch-chg-003",
          operation: "relate",
          id: "task-1",
          relations: {
            tags: [{ "$ref": "tag-1" }, { "$ref": "tag-2" }],
          },
        }),
      });

      const res = await relServer.router.handle(req, {});
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);

      // Verify __datafn_meta modified exactly once (batch allocation for 2 join deltas)
      const metaCreateCalls = (metaCreateSpy.mock.calls as any[]).filter((c) => c[0] === "__datafn_meta");
      const metaUpdateCalls = (metaUpdateSpy.mock.calls as any[]).filter((c) => c[0] === "__datafn_meta");
      const metaInteractionCount = metaCreateCalls.length + metaUpdateCalls.length;
      expect(metaInteractionCount).toBe(1);

      // The single interaction must allocate 2 sequences (next_server_seq = 1 + 2 = 3)
      const metaData = (metaCreateCalls[0]?.[1] ?? metaUpdateCalls[0]?.[2]) as any;
      expect(metaData.next_server_seq).toBe(3);

      // Verify 2 changes recorded with contiguous serverSeq values
      const changes = await relDb.internal.findMany(
        "__datafn_changes",
        [],
        { orderBy: "server_seq" },
      );
      expect(changes).toHaveLength(2);
      expect(changes[0].server_seq).toBe(1);
      expect(changes[1].server_seq).toBe(2);

      metaCreateSpy.mockRestore();
      metaUpdateSpy.mockRestore();
    });

    it("TV-BATCH-CHG-003 negative: regular mutations use singular seq (not batched)", async () => {
      const metaCreateSpy = vi.spyOn(relDb.internal, "create");
      const metaUpdateSpy = vi.spyOn(relDb.internal, "update");

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "tasks",
          version: "1",
          clientId: "client-1",
          mutationId: "mut-singular-seq",
          operation: "merge",
          id: "task-1",
          record: { title: "Updated" },
        }),
      });

      const res = await relServer.router.handle(req, {});
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);

      // Regular mutation: also 1 meta interaction, but increments by 1 (not batched)
      const metaCreateCalls = (metaCreateSpy.mock.calls as any[]).filter((c) => c[0] === "__datafn_meta");
      const metaUpdateCalls = (metaUpdateSpy.mock.calls as any[]).filter((c) => c[0] === "__datafn_meta");
      const metaInteractionCount = metaCreateCalls.length + metaUpdateCalls.length;
      expect(metaInteractionCount).toBe(1);

      const metaData = (metaCreateCalls[0]?.[1] ?? metaUpdateCalls[0]?.[2]) as any;
      expect(metaData.next_server_seq).toBe(2); // 1 (start) + 1 = 2

      // Verify 1 change recorded
      const changes = await relDb.internal.findMany("__datafn_changes", [], { orderBy: "server_seq" });
      expect(changes).toHaveLength(1);

      metaCreateSpy.mockRestore();
      metaUpdateSpy.mockRestore();
    });
  });
});
