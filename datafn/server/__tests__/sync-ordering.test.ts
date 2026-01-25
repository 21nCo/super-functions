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
      const server = await createDatafnServer({
        schema: defaultSchema,
        db,
      });

      // First mutation
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

      // Second mutation on same record
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
      const server = await createDatafnServer({
        schema: defaultSchema,
        db,
      });

      // First mutation with high client timestamp
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

      // Second mutation with low client timestamp
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
      const server = await createDatafnServer({
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
      const server = await createDatafnServer({
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
      const server = await createDatafnServer({
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
            cursors: { task: "0" },
          }),
        })
      );

      const body1 = await res1.json();
      expect(body1.ok).toBe(true);
      expect(body1.result.ok).toBe(true);
      expect(body1.result.records.task).toHaveLength(1);
      expect(body1.result.records.task[0].id).toBe("task:1");
      expect(body1.result.records.task[0].title).toBe("A");
      expect(body1.result.deleted.task).toHaveLength(0);
      expect(body1.result.cursors.task).toBe("1");

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
            cursors: { task: "1" },
          }),
        })
      );

      const body2 = await res2.json();
      expect(body2.ok).toBe(true);
      expect(body2.result.ok).toBe(true);
      expect(body2.result.records.task).toHaveLength(0);
      expect(body2.result.deleted.task).toHaveLength(1);
      expect(body2.result.deleted.task[0]).toBe("task:1");
      expect(body2.result.cursors.task).toBe("2");
    });

    it("TV-SERVER-PULL-002: Invalid cursor values are rejected", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({
        schema: defaultSchema,
        db,
      });

      const res = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursors: { task: "nope" },
          }),
        })
      );

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("cursor must be an integer string");
    });
  });

  describe("Push endpoint (SERVER-SYNC-003)", () => {
    it("TV-SERVER-PUSH-001: Push mutations observable via pull", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({
        schema: defaultSchema,
        db,
      });

      // Push mutation
      const res1 = await server.router.handle(
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
      expect(body1.result.applied).toContain("m-push-1");
      expect(body1.result.errors).toHaveLength(0);

      // Pull to verify
      const res2 = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursors: { task: "0" },
          }),
        })
      );

      const body2 = await res2.json();
      expect(body2.ok).toBe(true);
      expect(body2.result.ok).toBe(true);
      expect(body2.result.records.task).toHaveLength(1);
      expect(body2.result.records.task[0].id).toBe("task:1");
      expect(body2.result.records.task[0].title).toBe("P");
      expect(body2.result.cursors.task).toBe("1");
    });

    it("TV-SERVER-PUSH-002: Missing clientId is rejected", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({
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
});
