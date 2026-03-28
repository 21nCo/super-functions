/**
 * Phase 08 Tests: Server Envelopes, Status & Auth
 * Tests TV-STATUS-001, TV-STATUS-002, TV-AUTH-001, TV-AUTH-002
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
};

describe("Phase 8: Server Status & Auth", () => {
  describe("TV-STATUS-001: Status capabilities", () => {
    it("advertises full capability set when DB is healthy", async () => {
      const db = memoryAdapter();
      await db.initialize();

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        db,
      });

      const res = await server.router.handle(
        new Request("http://localhost/datafn/status", {
          method: "GET",
        })
      );

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.capabilities).toEqual([
        "dfql.query",
        "dfql.mutation",
        "dfql.transact",
        "sync.seed",
        "sync.clone",
        "sync.pull",
        "sync.push",
        "sync.reconcile",
      ]);
    });
  });

  describe("TV-STATUS-002: DB health gating", () => {
    it("returns INTERNAL when DB is unhealthy", async () => {
      // Create unhealthy adapter
      const unhealthyDb = {
        async initialize() {},
        async isHealthy() {
          return { healthy: false, message: "DB connection failed" };
        },
      };

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        db: unhealthyDb as any,
      });

      const res = await server.router.handle(
        new Request("http://localhost/datafn/status", {
          method: "GET",
        })
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INTERNAL");
      expect(body.error.message).toBe("Internal error");
    });
  });

  describe("TV-AUTH-001: Auth receives payload", () => {
    it("passes parsed JSON body to authorize for POST endpoints", async () => {
      let capturedPayload: unknown = undefined;

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: async (_ctx, action, payload) => {
          capturedPayload = payload;
          return true; // Allow
        },
      });

      await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id"],
          }),
        })
      );

      expect(capturedPayload).toEqual({
        resource: "task",
        version: 1,
        select: ["id"],
      });
    });

    it("passes null to authorize for GET endpoints", async () => {
      let capturedPayload: unknown = "NOT_SET";

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: async (_ctx, action, payload) => {
          capturedPayload = payload;
          return true;
        },
      });

      await server.router.handle(
        new Request("http://localhost/datafn/status", {
          method: "GET",
        })
      );

      expect(capturedPayload).toBe(null);
    });
  });

  describe("TV-AUTH-002: Authorization denial", () => {
    it("returns FORBIDDEN when authorize returns false", async () => {
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        authorize: async () => false, // Deny all
      });

      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
          }),
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe("Authorization denied");
      expect(body.error.details.path).toBe("$");
    });
  });
});
