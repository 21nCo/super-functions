/**
 * Phase 09: Sync ordering and change tracking tests
 * Tests TV-CONFLICT-001, TV-CONFLICT-002, TV-SERVER-CLONE-001/002,
 * TV-SERVER-PULL-001/002, TV-SERVER-PUSH-001/002
 */

import { describe, it, expect } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../src/server.js";

// Default schema for tests
const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
    {
      name: "goal",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [],
};

describe("Phase 09: Server Sync Semantics", () => {
  describe("Conflict ordering (SERVER-CONFLICT-001)", () => {
    it("TV-CONFLICT-001: Last-write-wins by server ordering", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      // Seed the record first via insert
      const res0 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:0",
            mutationId: "m-0",
            id: "task:1",
            record: { title: "Initial" },
          }),
        })
      );
      const body0 = await res0.json();
      expect(body0.ok).toBe(true);

      // First merge mutation
      const res1 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "merge",
            clientId: "client:1",
            mutationId: "m-1",
            id: "task:1",
            record: { title: "A" },
          }),
        })
      );
      const body1 = await res1.json();
      expect(body1.ok).toBe(true);
      expect(body1.result.ok).toBe(true);
      expect(body1.result.mutationId).toBe("m-1");

      // Second merge mutation on same record
      const res2 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "merge",
            clientId: "client:2",
            mutationId: "m-2",
            id: "task:1",
            record: { title: "B" },
          }),
        })
      );
      const body2 = await res2.json();
      expect(body2.ok).toBe(true);
      expect(body2.result.ok).toBe(true);
      expect(body2.result.mutationId).toBe("m-2");

      // Query to verify last-write-wins
      const res3 = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id", "title"],
            filters: { id: "task:1" },
          }),
        })
      );
      const body3 = await res3.json();
      expect(body3.ok).toBe(true);
      expect(body3.result.data).toHaveLength(1);
      expect(body3.result.data[0].title).toBe("B"); // Second mutation wins
    });

    it("TV-CONFLICT-002: Client timestamps don't affect ordering", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      // Seed the record first via insert
      const res0 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:0",
            mutationId: "m-ts-0",
            id: "task:1",
            record: { title: "Initial" },
          }),
        })
      );
      const body0 = await res0.json();
      expect(body0.ok).toBe(true);

      // First merge mutation with high client timestamp
      const res1 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "merge",
            clientId: "client:1",
            mutationId: "m-ts-1",
            id: "task:1",
            record: { title: "OldTs" },
            context: { clientTimestampMs: 999999 },
          }),
        })
      );
      const body1 = await res1.json();
      expect(body1.ok).toBe(true);

      // Second merge mutation with low client timestamp
      const res2 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "merge",
            clientId: "client:2",
            mutationId: "m-ts-2",
            id: "task:1",
            record: { title: "Wins" },
            context: { clientTimestampMs: 0 },
          }),
        })
      );
      const body2 = await res2.json();
      expect(body2.ok).toBe(true);

      // Query to verify server ordering wins (not client timestamp)
      const res3 = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id", "title"],
            filters: { id: "task:1" },
          }),
        })
      );
      const body3 = await res3.json();
      expect(body3.ok).toBe(true);
      expect(body3.result.data[0].title).toBe("Wins"); // Server order, not timestamp
    });
  });

  describe("Clone endpoint (SERVER-SYNC-001)", () => {
    it("TV-SERVER-CLONE-001: Returns deterministic snapshot and cursor", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      // Create some records
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-c1",
            id: "task:1",
            record: { title: "A" },
          }),
        })
      );

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-c2",
            id: "task:2",
            record: { title: "B" },
          }),
        })
      );

      // Clone
      const res = await server.router.handle(
        new Request("http://localhost/datafn/clone", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            tables: ["task"],
          }),
        })
      );

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(body.result.data.task).toHaveLength(2);
      expect(body.result.data.task[0].id).toBe("task:1");
      expect(body.result.data.task[1].id).toBe("task:2");
      expect(body.result.data.task[0].title).toBe("A");
      expect(body.result.data.task[1].title).toBe("B");
      expect(body.result.cursors.task).toBe("2"); // serverSeq of latest change
    });

    it("TV-SERVER-CLONE-002: Remote-only table is rejected", async () => {
      const remoteOnlySchema = {
        resources: [
          {
            name: "remote",
            version: 1,
            isRemoteOnly: true,
            fields: [{ name: "label", type: "string", required: true }],
          },
        ],
        relations: [],
      };

      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: remoteOnlySchema,
        db,
      });

      const res = await server.router.handle(
        new Request("http://localhost/datafn/clone", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            tables: ["remote"],
          }),
        })
      );

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain(
        "remote-only table cannot be cloned"
      );
    });
  });

  describe("Pull endpoint (SERVER-SYNC-002)", () => {
    it("TV-SERVER-PULL-001: Returns records+deleted since cursor and advances cursor", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      // Insert a record
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-p1",
            id: "task:1",
            record: { title: "A" },
          }),
        })
      );

      // Pull from cursor 0
      const res1 = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursor: "0",
            limit: 1,
          }),
        })
      );

      const body1 = await res1.json();
      expect(body1.ok).toBe(true);
      expect(body1.result.ok).toBe(true);
      expect(body1.result.changes).toHaveLength(1);
      // After FIX-A, insert ops preserve op type in changelog (was "upsert", now "insert")
      expect(body1.result.changes[0].op).toBe("insert");
      expect(body1.result.changes[0].id).toBe("task:1");
      expect(body1.result.changes[0].record.title).toBe("A");
      expect(body1.result.nextCursor).toBe("1");

      // Delete the record
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "delete",
            clientId: "client:1",
            mutationId: "m-p2",
            id: "task:1",
          }),
        })
      );

      // Pull from cursor 1
      const res2 = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursor: "1",
            limit: 1,
          }),
        })
      );

      const body2 = await res2.json();
      expect(body2.ok).toBe(true);
      expect(body2.result.ok).toBe(true);
      expect(body2.result.changes).toHaveLength(1);
      expect(body2.result.changes[0].op).toBe("delete");
      expect(body2.result.changes[0].id).toBe("task:1");
      expect(body2.result.nextCursor).toBe("2");
    });

    it("TV-SERVER-PULL-002: Invalid cursor values are rejected", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      const res = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursor: "nope",
          }),
        })
      );

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(false);
      expect(body.result.error.code).toBe("DFQL_INVALID");
      expect(body.result.error.message).toContain("cursor must be an integer string");
    });
  });

  describe("Push endpoint (SERVER-SYNC-003)", () => {
    it("TV-SERVER-PUSH-001: Push mutations observable via pull", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      // Push insert + merge mutation
      const res1 = await server.router.handle(
        new Request("http://localhost/datafn/push", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            mutations: [
              {
                resource: "task",
                version: 1,
                operation: "insert",
                clientId: "client:1",
                mutationId: "m-push-0",
                id: "task:1",
                record: { title: "Initial" },
              },
              {
                resource: "task",
                version: 1,
                operation: "merge",
                clientId: "client:1",
                mutationId: "m-push-1",
                id: "task:1",
                record: { title: "P" },
              },
            ],
          }),
        })
      );

      const body1 = await res1.json();
      expect(body1.ok).toBe(true);
      expect(body1.result.ok).toBe(true);
      expect(body1.result.applied).toContain("m-push-0");
      expect(body1.result.applied).toContain("m-push-1");
      expect(body1.result.errors).toHaveLength(0);

      // Pull to verify — expect 2 changes (insert + merge)
      const res2 = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursor: "0",
            limit: 10,
          }),
        })
      );

      const body2 = await res2.json();
      expect(body2.ok).toBe(true);
      expect(body2.result.ok).toBe(true);
      expect(body2.result.changes.length).toBeGreaterThanOrEqual(1);
      // The merge change should be present
      const mergeChange = body2.result.changes.find((c: any) => c.op === "merge");
      expect(mergeChange).toBeDefined();
      expect(mergeChange.id).toBe("task:1");
      expect(mergeChange.record.title).toBe("P");
    });

    it("TV-SERVER-PUSH-002: Missing clientId is rejected", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      const res = await server.router.handle(
        new Request("http://localhost/datafn/push", {
          method: "POST",
          body: JSON.stringify({
            mutations: [],
          }),
        })
      );

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("clientId must be string");
    });
  });

  describe("OBS-001: applied/change-tracking gating", () => {
    it("ineligible merge is excluded from applied and does not produce pull changes", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({
        allowUnknownResources: true,
        schema: defaultSchema,
        db,
      });

      const pushRes = await server.router.handle(
        new Request("http://localhost/datafn/push", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            mutations: [
              {
                resource: "task",
                version: 1,
                operation: "merge",
                clientId: "client:1",
                mutationId: "m-missing-task",
                id: "task:missing",
                record: {},
              },
            ],
          }),
        }),
      );
      const pushBody = await pushRes.json();
      expect(pushBody.ok).toBe(true);
      expect(pushBody.result.ok).toBe(true);
      expect(pushBody.result.applied).not.toContain("m-missing-task");
      expect(pushBody.result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ mutationId: "m-missing-task", code: "NOT_FOUND", path: "id" }),
        ]),
      );

      const pullRes = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({ clientId: "client:1", cursor: "0", limit: 100 }),
        }),
      );
      const pullBody = await pullRes.json();
      expect(pullBody.ok).toBe(true);
      expect(pullBody.result.ok).toBe(true);
      expect(pullBody.result.changes).toHaveLength(0);
    });
  });
});
