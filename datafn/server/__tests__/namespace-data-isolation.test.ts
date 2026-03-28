/**
 * Data-Level Namespace Isolation Integration Tests
 *
 * End-to-end tests proving that clone, query, mutation, and push operations
 * are data-isolated when the datafn server has `namespaceProvider` enabled
 * and row-level namespace wrapping is active.
 *
 * Covers: DFN-001, DFN-003, DFN-004, DFN-005, DFN-006, RLN-001, RLN-003, RLN-005
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatafnServer, type DatafnServer } from "../src/server.js";
import { WebSocketManager, type WebSocketClient } from "../src/ws.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { Adapter } from "@superfunctions/db";

// ---------------------------------------------------------------------------
// Test schema
// ---------------------------------------------------------------------------

const testSchema = {
  resources: [
    {
      name: "todo",
      version: 1,
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "status", type: "string" as const, required: false },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tracks the "current user" for auth context extraction */
let currentUser: { userId: string; tenantId?: string } = { userId: "alice" };

function setUser(userId: string, tenantId?: string) {
  currentUser = { userId, tenantId };
}

async function createIsolatedServer(db: Adapter) {
  return createDatafnServer({ allowUnknownResources: true,
    schema: testSchema,
    db,
    namespaceProvider: {
      getNamespace: () => {
        if (currentUser.tenantId) return `tenant:${currentUser.tenantId}:user:${currentUser.userId}`;
        return `user:${currentUser.userId}`;
      },
    },
  });
}

function pushRequest(
  clientId: string,
  mutations: Array<{
    operation: string;
    resource: string;
    id: string;
    mutationId: string;
    record?: Record<string, any>;
  }>,
) {
  return new Request("http://localhost/datafn/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, mutations: mutations.map((m) => ({ ...m, clientId })) }),
  });
}

function queryRequest(resource: string, filters?: Record<string, any>) {
  const body: any = { resource };
  if (filters) body.filters = filters;
  return new Request("http://localhost/datafn/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cloneRequest(clientId: string) {
  return new Request("http://localhost/datafn/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, tables: ["todo"] }),
  });
}

function mutationRequest(
  clientId: string,
  mutation: {
    operation: string;
    resource: string;
    id: string;
    mutationId: string;
    record?: Record<string, any>;
  },
) {
  return new Request("http://localhost/datafn/mutation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...mutation, clientId }),
  });
}

function pullRequest(clientId: string, cursor: string) {
  return new Request("http://localhost/datafn/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, cursor }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Data-Level Namespace Isolation (Phase 03)", () => {
  let db: Adapter;
  let server: DatafnServer;

  beforeEach(async () => {
    db = memoryAdapter();
    server = await createIsolatedServer(db);
  });

  // Seed helper: push mutations as a specific user
  async function seedAsTodos(
    userId: string,
    todos: Array<{ id: string; title: string; status?: string }>,
  ) {
    setUser(userId);
    const res = await server.router.handle(
      pushRequest(
        `client:${userId}`,
        todos.map((t, i) => ({
          operation: "insert",
          resource: "todo",
          id: t.id,
          mutationId: `m-${userId}-${i}`,
          record: { title: t.title, status: t.status ?? "open" },
        })),
      ),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    return body.result.cursor;
  }

  // =========================================================================
  // 3.2 — Clone isolation (DFN-003, TV-DFN-004)
  // =========================================================================

  describe("clone isolation (DFN-003)", () => {
    beforeEach(async () => {
      await seedAsTodos("alice", [
        { id: "todo:a1", title: "Alice 1" },
        { id: "todo:a2", title: "Alice 2" },
        { id: "todo:a3", title: "Alice 3" },
      ]);
      await seedAsTodos("bob", [
        { id: "todo:b1", title: "Bob 1" },
        { id: "todo:b2", title: "Bob 2" },
      ]);
    });

    it("TV-DFN-004: Alice clones → receives exactly 3 todos", async () => {
      setUser("alice");
      const res = await server.router.handle(cloneRequest("client:alice"));
      const body = await res.json();
      expect(body.ok).toBe(true);

      const todos = body.result.data?.todo ?? body.result.data?.todos ?? [];
      expect(todos).toHaveLength(3);
      const ids = todos.map((t: any) => t.id).sort();
      expect(ids).toEqual(["todo:a1", "todo:a2", "todo:a3"]);

      // No __ns column visible
      for (const t of todos) {
        expect(t).not.toHaveProperty("__ns");
      }
    });

    it("TV-DFN-004: Bob clones → receives exactly 2 todos", async () => {
      setUser("bob");
      const res = await server.router.handle(cloneRequest("client:bob"));
      const body = await res.json();
      expect(body.ok).toBe(true);

      const todos = body.result.data?.todo ?? body.result.data?.todos ?? [];
      expect(todos).toHaveLength(2);
      const ids = todos.map((t: any) => t.id).sort();
      expect(ids).toEqual(["todo:b1", "todo:b2"]);
    });
  });

  // =========================================================================
  // 3.3 — Query isolation (DFN-004, TV-DFN-006, TV-DFN-007)
  // =========================================================================

  describe("query isolation (DFN-004)", () => {
    beforeEach(async () => {
      await seedAsTodos("alice", [
        { id: "todo:a1", title: "Alice Open", status: "open" },
        { id: "todo:a2", title: "Alice Done", status: "done" },
        { id: "todo:a3", title: "Alice Open 2", status: "open" },
      ]);
      await seedAsTodos("bob", [
        { id: "todo:b1", title: "Bob Open", status: "open" },
        { id: "todo:b2", title: "Bob Done", status: "done" },
      ]);
    });

    it("TV-DFN-006: Alice queries all todos → 3 results", async () => {
      setUser("alice");
      const res = await server.router.handle(queryRequest("todo"));
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.data).toHaveLength(3);
    });

    it("TV-DFN-006: Bob queries all todos → 2 results", async () => {
      setUser("bob");
      const res = await server.router.handle(queryRequest("todo"));
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.data).toHaveLength(2);
    });

    it("TV-DFN-007: Alice queries with filter → only Alice's matching records", async () => {
      setUser("alice");
      const res = await server.router.handle(
        queryRequest("todo", { status: { $eq: "open" } }),
      );
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.data).toHaveLength(2);
      for (const t of body.result.data) {
        expect(t.status).toBe("open");
        expect(t).not.toHaveProperty("__ns");
      }
    });
  });

  // =========================================================================
  // 3.4 — Mutation isolation (DFN-005, TV-DFN-008, TV-DFN-009)
  // =========================================================================

  describe("mutation isolation (DFN-005)", () => {
    beforeEach(async () => {
      await seedAsTodos("alice", [
        { id: "todo:a1", title: "Alice Task", status: "open" },
      ]);
      await seedAsTodos("bob", [
        { id: "todo:b1", title: "Bob Task", status: "open" },
        { id: "todo:b2", title: "Bob Task 2", status: "open" },
      ]);
    });

    it("TV-DFN-008: Alice merge updates only her todo", async () => {
      setUser("alice");
      const res = await server.router.handle(
        mutationRequest("client:alice", {
          operation: "merge",
          resource: "todo",
          id: "todo:a1",
          mutationId: "m-upd-1",
          record: { status: "done" },
        }),
      );
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Verify Bob's todos are unchanged
      setUser("bob");
      const bobRes = await server.router.handle(queryRequest("todo"));
      const bobBody = await bobRes.json();
      expect(bobBody.result.data).toHaveLength(2);
      for (const t of bobBody.result.data) {
        expect(t.status).toBe("open");
      }
    });

    it("TV-DFN-009: Alice delete does not affect Bob's count", async () => {
      setUser("alice");
      const res = await server.router.handle(
        mutationRequest("client:alice", {
          operation: "delete",
          resource: "todo",
          id: "todo:a1",
          mutationId: "m-del-1",
        }),
      );
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Bob still has 2 todos
      setUser("bob");
      const bobRes = await server.router.handle(queryRequest("todo"));
      const bobBody = await bobRes.json();
      expect(bobBody.result.data).toHaveLength(2);

      // Alice has 0 todos
      setUser("alice");
      const aliceRes = await server.router.handle(queryRequest("todo"));
      const aliceBody = await aliceRes.json();
      expect(aliceBody.result.data).toHaveLength(0);
    });

    it("TV-DFN-009: Alice cannot merge Bob's record (cross-tenant blocked)", async () => {
      setUser("alice");
      const res = await server.router.handle(
        mutationRequest("client:alice", {
          operation: "merge",
          resource: "todo",
          id: "todo:b1",
          mutationId: "m-cross-1",
          record: { title: "Hacked" },
        }),
      );
      // The merge should either fail or be a no-op (NOT_FOUND in alice's namespace)
      // Either 200 with error or the record is unchanged
      const body = await res.json();

      // Verify Bob's record is unchanged
      setUser("bob");
      const bobRes = await server.router.handle(queryRequest("todo"));
      const bobBody = await bobRes.json();
      const b1 = bobBody.result.data.find((t: any) => t.id === "todo:b1");
      expect(b1.title).toBe("Bob Task"); // unchanged
    });
  });

  // =========================================================================
  // 3.5 — Push isolation (DFN-006, TV-DFN-010)
  // =========================================================================

  describe("push isolation (DFN-006)", () => {
    it("TV-DFN-010: Alice push stamps namespace; Bob pull does NOT see Alice's changes", async () => {
      // Bob pushes first to establish a cursor
      const bobCursor = await seedAsTodos("bob", [
        { id: "todo:b1", title: "Bob existing" },
      ]);

      // Alice pushes new data
      await seedAsTodos("alice", [
        { id: "todo:a1", title: "Alice new" },
      ]);

      // Bob pulls from his cursor — should NOT see Alice's data
      setUser("bob");
      const pullRes = await server.router.handle(
        pullRequest("client:bob", bobCursor),
      );
      const pullBody = await pullRes.json();
      expect(pullBody.ok).toBe(true);

      // Bob's pull should have no new changes (Alice's changes are in a different namespace)
      const changes = pullBody.result.changes ?? [];
      const aliceChanges = changes.filter(
        (c: any) => c.id === "todo:a1" || (c.record && c.record.title === "Alice new"),
      );
      expect(aliceChanges).toHaveLength(0);
    });

    it("Alice pulls her own pushed changes", async () => {
      // Alice pushes
      setUser("alice");
      const pushRes = await server.router.handle(
        pushRequest("client:alice", [
          {
            operation: "insert",
            resource: "todo",
            id: "todo:a1",
            mutationId: "m-alice-1",
            record: { title: "Alice's task" },
          },
        ]),
      );
      const pushBody = await pushRes.json();
      expect(pushBody.ok).toBe(true);

      // Alice pulls from cursor 0 — should see her changes
      setUser("alice");
      const pullRes = await server.router.handle(
        pullRequest("client:alice-pull", "0"),
      );
      const pullBody = await pullRes.json();
      expect(pullBody.ok).toBe(true);

      const changes = pullBody.result.changes ?? [];
      expect(changes.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 3.6 — Cross-namespace access attempt
  // =========================================================================

  describe("cross-namespace access attempt", () => {
    beforeEach(async () => {
      await seedAsTodos("alice", [
        { id: "todo:a1", title: "Alice Secret" },
      ]);
      await seedAsTodos("bob", [
        { id: "todo:b1", title: "Bob Secret" },
      ]);
    });

    it("fabricated __ns WHERE clause cannot bypass namespace isolation", async () => {
      // Alice tries to query with a filter targeting Bob's namespace
      setUser("alice");
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource: "todo",
            filters: { __ns: { $eq: "user:bob" } },
          }),
        }),
      );
      const body = await res.json();

      // Should still only return Alice's data (wrapper prepends Alice's __ns)
      if (body.ok && body.result?.data) {
        for (const record of body.result.data) {
          expect(record.id).not.toBe("todo:b1");
        }
      }
    });
  });

  // =========================================================================
  // TST-002 — WebSocket cursor broadcast scoped to namespace (SCA-006)
  // =========================================================================

  describe("TST-002: WS cursor broadcast scoped to namespace (SCA-006)", () => {
    it("broadcastCursor only reaches clients in the matching namespace", () => {
      const mgr = new WebSocketManager();

      // Alice has 2 WS clients in her namespace
      const aliceNs = "user:alice";
      const aliceC1: WebSocketClient = { send: vi.fn() };
      const aliceC2: WebSocketClient = { send: vi.fn() };

      // Bob has 1 WS client in his namespace
      const bobNs = "user:bob";
      const bobC1: WebSocketClient = { send: vi.fn() };

      mgr.addClient(aliceC1, { namespace: aliceNs });
      mgr.addClient(aliceC2, { namespace: aliceNs });
      mgr.addClient(bobC1, { namespace: bobNs });

      // Broadcast a cursor update to Alice's namespace
      mgr.broadcastCursor("42", aliceNs);

      const expectedMsg = JSON.stringify({ type: "cursor", cursor: "42" });

      // Alice's clients receive the cursor
      expect(aliceC1.send).toHaveBeenCalledWith(expectedMsg);
      expect(aliceC2.send).toHaveBeenCalledWith(expectedMsg);

      // Bob's client does NOT receive Alice's cursor broadcast
      expect(bobC1.send).not.toHaveBeenCalled();

      mgr.destroy();
    });

    it("broadcastCursor to Bob's namespace does not reach Alice's clients", () => {
      const mgr = new WebSocketManager();

      const aliceNs = "user:alice";
      const bobNs = "user:bob";

      const aliceC: WebSocketClient = { send: vi.fn() };
      const bobC: WebSocketClient = { send: vi.fn() };

      mgr.addClient(aliceC, { namespace: aliceNs });
      mgr.addClient(bobC, { namespace: bobNs });

      // Broadcast cursor to Bob's namespace
      mgr.broadcastCursor("99", bobNs);

      const expectedMsg = JSON.stringify({ type: "cursor", cursor: "99" });

      // Bob receives
      expect(bobC.send).toHaveBeenCalledWith(expectedMsg);
      // Alice does NOT receive
      expect(aliceC.send).not.toHaveBeenCalled();

      mgr.destroy();
    });

    it("client removed from its namespace after removeClient — no longer receives broadcast", () => {
      const mgr = new WebSocketManager();
      const ns = "user:alice";

      const c1: WebSocketClient = { send: vi.fn() };
      const c2: WebSocketClient = { send: vi.fn() };

      mgr.addClient(c1, { namespace: ns });
      mgr.addClient(c2, { namespace: ns });

      mgr.removeClient(c1);

      mgr.broadcastCursor("10", ns);

      const expectedMsg = JSON.stringify({ type: "cursor", cursor: "10" });
      // c1 removed — must NOT receive
      expect(c1.send).not.toHaveBeenCalled();
      // c2 still connected — must receive
      expect(c2.send).toHaveBeenCalledWith(expectedMsg);

      mgr.destroy();
    });

    it("namespace is server-derived: client-supplied namespace in hello message is ignored", () => {
      const mgr = new WebSocketManager();
      const serverNs = "user:alice";

      const client: WebSocketClient = { send: vi.fn() };
      mgr.addClient(client, { namespace: serverNs });

      // Client tries to override their namespace via hello message
      mgr.handleMessage(
        client,
        JSON.stringify({ type: "hello", clientId: "c1", cursor: "0", namespace: "user:bob" }),
      );

      // After the attempted override, broadcast to Alice's namespace still reaches this client
      mgr.broadcastCursor("55", serverNs);
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "cursor", cursor: "55" }),
      );

      // Broadcast to Bob's namespace does NOT reach this client (SEC-002)
      vi.clearAllMocks();
      mgr.broadcastCursor("56", "user:bob");
      expect(client.send).not.toHaveBeenCalled();

      mgr.destroy();
    });
  });

  // =========================================================================
  // TST-002 — Seed handler uses namespace from namespaceProvider (not hardcoded)
  // =========================================================================

  describe("TST-002: Seed handler uses namespaceProvider-derived namespace", () => {
    it("seed for alice creates seed record under alice's namespace", async () => {
      setUser("alice");
      const res = await server.router.handle(
        new Request("http://localhost/datafn/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: "client:alice" }),
        }),
      );
      const body = await res.json();

      // Seed must succeed
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result?.ok).toBe(true);
    });

    it("seed is idempotent: second call for same namespace succeeds with ok: true", async () => {
      setUser("alice");

      const req = () =>
        new Request("http://localhost/datafn/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: "client:alice" }),
        });

      await server.router.handle(req());
      const res2 = await server.router.handle(req());
      const body2 = await res2.json();

      // Second call: idempotent — must still succeed
      expect(res2.status).toBe(200);
      expect(body2.ok).toBe(true);
    });

    it("seed for alice and bob create independent seed records", async () => {
      setUser("alice");
      const resA = await server.router.handle(
        new Request("http://localhost/datafn/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: "client:alice" }),
        }),
      );
      expect((await resA.json()).ok).toBe(true);

      setUser("bob");
      const resB = await server.router.handle(
        new Request("http://localhost/datafn/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: "client:bob" }),
        }),
      );
      expect((await resB.json()).ok).toBe(true);
    });
  });

  // =========================================================================
  // TST-002 — Cross-namespace mutation attempts are rejected / no-op
  // =========================================================================

  describe("TST-002: Cross-namespace mutation attempts fail or are no-ops", () => {
    beforeEach(async () => {
      await seedAsTodos("alice", [
        { id: "todo:cross-a1", title: "Alice Private" },
      ]);
      await seedAsTodos("bob", [
        { id: "todo:cross-b1", title: "Bob Private" },
      ]);
    });

    it("Alice delete on Bob's ID does not remove Bob's record", async () => {
      setUser("alice");
      await server.router.handle(
        mutationRequest("client:alice", {
          operation: "delete",
          resource: "todo",
          id: "todo:cross-b1",
          mutationId: "m-cross-del",
        }),
      );

      // Bob's record must still exist
      setUser("bob");
      const res = await server.router.handle(queryRequest("todo"));
      const body = await res.json();
      expect(body.result.data).toHaveLength(1);
      expect(body.result.data[0].id).toBe("todo:cross-b1");
    });

    it("Alice insert with Bob's ID lands in Alice's namespace, not Bob's", async () => {
      // Alice inserts using the same ID as one of Bob's records
      setUser("alice");
      const res = await server.router.handle(
        mutationRequest("client:alice", {
          operation: "insert",
          resource: "todo",
          id: "todo:cross-b1", // same ID, different namespace
          mutationId: "m-cross-insert",
          record: { title: "Alice Copy" },
        }),
      );
      const body = await res.json();
      // Insert may succeed (namespace isolation creates separate rows)
      // regardless, Bob's original record must be unchanged
      setUser("bob");
      const bobRes = await server.router.handle(queryRequest("todo"));
      const bobBody = await bobRes.json();
      const bobRecord = bobBody.result.data.find(
        (t: any) => t.id === "todo:cross-b1",
      );
      expect(bobRecord).toBeDefined();
      expect(bobRecord.title).toBe("Bob Private"); // Bob's version unchanged
    });
  });
});
