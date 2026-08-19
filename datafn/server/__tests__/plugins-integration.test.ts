/**
 * Phase 10 Plugin Execution Integration Tests
 * Uses actual HTTP server to avoid Request body reading issues
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatafnServer } from "../src/server.js";
import type {
  DatafnSchema,
  DatafnPlugin,
  DatafnHookContext,
} from "@datafn/core";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { SearchProvider } from "../src/search-provider.js";

// Test schemas
const taskSchema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "isArchived", type: "boolean", required: true },
      ],
    },
  ],
  relations: [],
};

// Test plugins
function createFilterPlugin(): DatafnPlugin {
  return {
    name: "p1",
    runsOn: ["server"],
    beforeQuery: async (_ctx: DatafnHookContext, query: unknown) => {
      const q = query as any;
      return {
        ...q,
        filters: { ...(q.filters || {}), isArchived: false },
      };
    },
  };
}

function createForbiddenPlugin(): DatafnPlugin {
  return {
    name: "p1",
    runsOn: ["server"],
    beforeMutation: async () => {
      const error: any = new Error("Forbidden");
      error.code = "FORBIDDEN";
      throw error;
    },
  };
}

function createSearchProvider(): SearchProvider {
  return {
    name: "test-search",
    search: async (params) => {
      const { query } = params;
      const searchQuery = query?.toLowerCase() || "";
      const candidateIds = searchQuery.includes("beta")
        ? ["task:t2"]
        : searchQuery.includes("alpha")
          ? ["task:t1"]
          : [];
      return candidateIds;
    },
    updateIndices: async () => {},
  };
}

describe("Phase 10: Plugin Integration Tests", () => {
  describe("TV-PLUG-SERVER-001: beforeQuery filter injection", () => {
    it("should inject isArchived: false and filter results", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: taskSchema,
        database: db,
        plugins: [createFilterPlugin()],
      });

      // Insert archived and non-archived tasks
      const mut1 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "c1",
            mutationId: "m-a",
            id: "task:1",
            record: { title: "Active", isArchived: false },
          }),
        })
      );
      const r1 = await mut1.json();
      expect(r1.ok).toBe(true);
      expect(r1.result.ok).toBe(true);

      const mut2 = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "c1",
            mutationId: "m-b",
            id: "task:2",
            record: { title: "Archived", isArchived: true },
          }),
        })
      );
      const r2 = await mut2.json();
      expect(r2.ok).toBe(true);

      // Query should only return non-archived
      const query = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id", "title"],
            sort: ["id:asc"],
          }),
        })
      );
      const qr = await query.json();

      expect(qr.ok).toBe(true);
      expect(qr.result.data).toHaveLength(1);
      expect(qr.result.data[0].title).toBe("Active");
    });
  });

  describe("TV-PLUG-SERVER-002: beforeMutation fail-closed", () => {
    it("should reject mutation when hook throws", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: taskSchema,
        database: db,
        plugins: [createForbiddenPlugin()],
      });

      const response = await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "c1",
            mutationId: "m-x",
            id: "task:1",
            record: { title: "Test", isArchived: false },
          }),
        })
      );
      const result = await response.json();

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("FORBIDDEN");
    });
  });

  describe("TV-SEARCH-001: search delegation", () => {
    it("should delegate search to provider", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const schema: DatafnSchema = {
        resources: [
          {
            name: "task",
            version: 1,
            fields: [{ name: "title", type: "string", required: true }],
          },
        ],
        relations: [],
      };
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema,
        database: db,
        searchProvider: createSearchProvider(),
      });

      // Insert tasks
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "c1",
            mutationId: "m-s1",
            id: "task:t1",
            record: { title: "Alpha" },
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
            clientId: "c1",
            mutationId: "m-s2",
            id: "task:t2",
            record: { title: "Beta" },
          }),
        })
      );

      // Search for "beta"
      const response = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id", "title"],
            search: { query: "beta", type: "fullText" },
            sort: ["id:asc"],
          }),
        })
      );
      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.result.data).toHaveLength(1);
      expect(result.result.data[0].title).toBe("Beta");
    });
  });

  describe("TV-SEARCH-002: search gating", () => {
    it("should reject search without searchProvider", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const schema: DatafnSchema = {
        resources: [
          {
            name: "task",
            version: 1,
            fields: [{ name: "title", type: "string", required: true }],
          },
        ],
        relations: [],
      };
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema,
        database: db,
      });

      const response = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id"],
            search: { query: "test", type: "fullText" },
          }),
        })
      );
      const result = await response.json();

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("DFQL_UNSUPPORTED");
      expect(result.error.message).toContain("search");
    });
  });
});
