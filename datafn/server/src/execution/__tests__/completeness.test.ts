import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDatafnServer } from "../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../core-types.js";

// Schema with nested objects and sensitive fields
const schema: DatafnSchema = {
  resources: [
    {
      name: "users",
      version: 1,
      fields: [
        { name: "username", type: "string", required: true },
        { name: "email", type: "string", required: true, encrypt: true },
        { name: "profile", type: "object" }, // Nested object
        { name: "score", type: "number" },
      ],
    },
  ],
  relations: [],
};

describe("Phase 15 Completeness", () => {
  let server: any;
  let db: any;

  beforeEach(async () => {
    db = memoryAdapter({ namespace: { enabled: true, prefix: "datafn" } });
    server = await createDatafnServer({ allowUnknownResources: true,
      schema,
      db,
      limits: { maxPayloadBytes: 1024 * 1024, maxLimit: 100 },
    });

    // Seed data
    await db.create({
      model: "users",
      data: {
        id: "u1",
        username: "alice",
        email: "alice@example.com",
        profile: { city: "New York", stats: { wins: 10 } },
        score: 100,
      },
      namespace: "datafn",
    });
    await db.create({
      model: "users",
      data: {
        id: "u2",
        username: "bob",
        email: "bob@example.com",
        profile: { city: "London", stats: { wins: 5 } },
        score: 50,
      },
      namespace: "datafn",
    });
    await db.create({
      model: "users",
      data: {
        id: "u3",
        username: "charlie",
        email: "charlie@example.com",
        profile: { city: "Paris", stats: { wins: 0 } },
        score: 0,
      },
      namespace: "datafn",
    });
  });

  describe("FILTER-001: Nested Object Filters", () => {
    it("should filter by nested object property", async () => {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "users",
            version: 1,
            filters: { "profile.city": "New York" },
          }),
        })
      );
      const result = await res.json();
      expect(result.ok).toBe(true);
      expect(result.result.data).toHaveLength(1);
      expect(result.result.data[0].username).toBe("alice");
    });

    it("should filter by deep nested property", async () => {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "users",
            version: 1,
            filters: { "profile.stats.wins": { gt: 8 } },
          }),
        })
      );
      const result = await res.json();
      expect(result.ok).toBe(true);
      expect(result.result.data).toHaveLength(1);
      expect(result.result.data[0].username).toBe("alice");
    });
  });

  describe("FILTER-002: Additional Operators", () => {
    it("should support 'in' operator", async () => {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "users",
            version: 1,
            filters: { username: { in: ["alice", "bob"] } },
          }),
        })
      );
      const result = await res.json();
      expect(result.ok).toBe(true);
      expect(result.result.data).toHaveLength(2);
    });

    it("should support 'between' operator", async () => {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "users",
            version: 1,
            filters: { score: { between: [40, 110] } },
          }),
        })
      );
      const result = await res.json();
      expect(result.ok).toBe(true);
      expect(result.result.data).toHaveLength(2); // 100, 50
    });
  });

  describe("AGG-001/002: Aggregate Ordering & Pagination", () => {
    it("should order aggregates by alias", async () => {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "users",
            version: 1,
            groupBy: ["profile.city"],
            aggregations: { totalScore: { op: "sum", field: "score" } },
            sort: ["totalScore:asc"],
          }),
        })
      );
      const result = await res.json();
      expect(result.ok).toBe(true);
      const groups = result.result.groups;
      expect(groups).toHaveLength(3);
      expect(groups[0].totalScore).toBe(0); // Paris
      expect(groups[1].totalScore).toBe(50); // London
      expect(groups[2].totalScore).toBe(100); // New York
    });

    it("should paginate aggregates", async () => {
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "users",
            version: 1,
            groupBy: ["username"],
            aggregations: { count: { op: "count", field: "*" } },
            sort: ["username:asc"],
            limit: 2,
          }),
        })
      );
      const result = await res.json();
      expect(result.ok).toBe(true);
      expect(result.result.groups).toHaveLength(2);
      expect(result.result.nextCursor).toBeDefined();
      expect(result.result.nextCursor.username).toBe("bob");
    });
  });

  describe("OBS-001: Log Redaction", () => {
    it("should redact sensitive fields in mutation logs", async () => {
      // LOG-001: Use a custom logger to capture structured log output
      const logEntries: Array<{ msg: string; ctx: Record<string, unknown> }> = [];
      const customLogger = {
        info: (msg: string, ctx?: Record<string, unknown>) => logEntries.push({ msg, ctx: ctx ?? {} }),
        warn: () => {},
        error: () => {},
        debug: () => {},
      };
      const logServer = await createDatafnServer({
        allowUnknownResources: true,
        schema,
        db,
        limits: { maxPayloadBytes: 1024 * 1024, maxLimit: 100 },
        logger: customLogger,
      });

      await logServer.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "users",
            version: 1,
            operation: "insert",
            clientId: "c1",
            mutationId: "m-redact",
            id: "u4",
            record: { username: "dave", email: "secret@example.com" },
          }),
        })
      );

      const logCall = logEntries.find(e => e.ctx?.mutationId === "m-redact");
      expect(logCall).toBeDefined();
      // SRV-004: mutation record data is NOT logged (privacy improvement)
      expect(logCall!.ctx.record).toBeUndefined();
      // Verify other metadata is still present
      expect(logCall!.ctx.resource).toBe("users");
      expect(logCall!.ctx.mutationId).toBe("m-redact");

      await logServer.close();
    });
  });

  describe("LIMIT-002: Depth Limits", () => {
    it("should reject deep nested filters", async () => {
        // Construct deep filter
        let filter: any = { username: "a" };
        for (let i = 0; i < 12; i++) {
            filter = { $and: [filter] };
        }
        
        const res = await server.router.handle(
            new Request("http://localhost/datafn/query", {
                method: "POST",
                body: JSON.stringify({
                    resource: "users",
                    version: 1,
                    filters: filter
                })
            })
        );
        const result = await res.json();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("LIMIT_EXCEEDED");
        expect(result.error.message).toMatch(/Filter nesting depth/);
    });
  });
});
