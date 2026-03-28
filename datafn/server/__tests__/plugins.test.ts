/**
 * Phase 10 Plugin Execution Tests
 * Tests server plugin hooks (TV-PLUG-SERVER-001/002, TV-SEARCH-001/002)
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import type {
  DatafnSchema,
  DatafnPlugin,
  DatafnHookContext,
} from "@datafn/core";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { SearchProvider } from "../src/search-provider.js";

// Default test schema with isArchived field for plugin tests
const defaultSchema: DatafnSchema = {
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

// DFQL schema fixture (used by search tests)
const dfqlSchema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
  relations: [],
};

/**
 * Test helper plugins
 */

// Plugin that injects isArchived: false filter into queries
function createAddFilterIsArchivedFalsePlugin(): DatafnPlugin {
  return {
    name: "p1",
    runsOn: ["server"],
    beforeQuery: async (ctx: DatafnHookContext, query: unknown) => {
      const q = query as any;
      // Add isArchived: false filter
      const existingFilters = q.filters || {};
      return {
        ...q,
        filters: {
          ...existingFilters,
          isArchived: false,
        },
      };
    },
  };
}

// Plugin that throws FORBIDDEN error in beforeMutation
function createThrowForbiddenPlugin(): DatafnPlugin {
  return {
    name: "p1",
    runsOn: ["server"],
    beforeMutation: async (_ctx: DatafnHookContext, _mutation: unknown) => {
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
      if (query.includes("beta")) {
        return ["task:t2"];
      } else if (query.includes("alpha")) {
        return ["task:t1"];
      }
      return [];
    },
    updateIndices: async () => {},
  };
}

/**
 * Helper to create server and make request
 */
async function makeRequest(
  schema: DatafnSchema,
  plugins: DatafnPlugin[],
  method: string,
  path: string,
  body: unknown,
): Promise<any> {
  const db = memoryAdapter({ namespace: "datafn" });
  const server = await createDatafnServer({ allowUnknownResources: true,
    schema,
    db,
    plugins,
  });

  const request = new Request(`http://localhost${path}`, {
    method,
    body: JSON.stringify(body),
  });

  const response = await server.router.handle(request, {});
  return await response.json();
}

describe("Phase 10: Server Plugin Execution", () => {
  describe("TV-PLUG-SERVER-001: beforeQuery plugin adds filter", () => {
    it("should inject isArchived: false filter and only return non-archived tasks", async () => {
      const db = memoryAdapter({ namespace: "datafn" });
      const plugins = [createAddFilterIsArchivedFalsePlugin()];
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        db,
        plugins,
      });

      // Insert two tasks: one archived, one not
      const request1 = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-a",
          id: "task:1",
          record: { title: "A", isArchived: false },
        }),
      });
      const response1 = await server.router.handle(request1);
      const result1 = await response1.json();
      console.log(
        "TV-PLUG-SERVER-001 mutation 1 result:",
        JSON.stringify(result1, null, 2),
      );
      expect(result1.ok).toBe(true);
      expect(result1.result.ok).toBe(true);

      const request2 = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-b",
          id: "task:2",
          record: { title: "B", isArchived: true },
        }),
      });
      const response2 = await server.router.handle(request2);
      const result2 = await response2.json();
      expect(result2.ok).toBe(true);

      // Query - plugin should inject isArchived: false filter
      const request3 = new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id", "title"],
          sort: ["id:asc"],
        }),
      });
      const response3 = await server.router.handle(request3);
      const result3 = await response3.json();

      expect(result3.ok).toBe(true);
      expect(result3.result.data).toHaveLength(1);
      expect(result3.result.data[0]).toEqual({ id: "task:1", title: "A" });
    });
  });

  describe("TV-PLUG-SERVER-002: beforeMutation plugin fail-closed", () => {
    it("should reject mutation when beforeMutation throws FORBIDDEN", async () => {
      const plugins = [createThrowForbiddenPlugin()];

      const result = await makeRequest(
        defaultSchema,
        plugins,
        "POST",
        "/datafn/mutation",
        {
          resource: "task",
          version: 1,
          operation: "merge",
          clientId: "client:1",
          mutationId: "m-deny",
          id: "task:1",
          record: { title: "X", isArchived: false },
        },
      );

      console.log(
        "TV-PLUG-SERVER-002 result:",
        JSON.stringify(result, null, 2),
      );
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toBe("Forbidden");
    });
  });

  describe("TV-SEARCH-001: With searchProvider, search is delegated", () => {
    it("should delegate search to provider and filter results", async () => {
      const db = memoryAdapter({ namespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: dfqlSchema,
        db,
        searchProvider: createSearchProvider(),
      });

      // Insert two tasks
      const request1 = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-s1",
          id: "task:t1",
          record: { title: "Alpha" },
        }),
      });
      await server.router.handle(request1);

      const request2 = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-s2",
          id: "task:t2",
          record: { title: "Beta" },
        }),
      });
      await server.router.handle(request2);

      // Search for "beta" - should only return task:t2
      const request3 = new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id", "title"],
          search: { query: "beta", type: "fullText", fields: ["title"] },
          sort: ["id:asc"],
        }),
      });
      const response3 = await server.router.handle(request3);
      const result3 = await response3.json();
      console.log(
        "DEBUG TV-SEARCH-001 result:",
        JSON.stringify(result3, null, 2),
      );

      expect(result3.ok).toBe(true);
      expect(result3.result.data).toHaveLength(1);
      expect(result3.result.data[0]).toEqual({ id: "task:t2", title: "Beta" });
    });
  });

  describe("TV-SEARCH-002: Without searchProvider, search is rejected", () => {
    it("should reject search queries when no searchProvider is configured", async () => {
      const result = await makeRequest(
        dfqlSchema,
        [], // No plugins
        "POST",
        "/datafn/query",
        {
          resource: "task",
          version: 1,
          select: ["id"],
          search: { query: "x", type: "fullText" },
        },
      );

      console.log("TV-SEARCH-002 result:", JSON.stringify(result, null, 2));
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("DFQL_UNSUPPORTED");
      expect(result.error.message).toContain("search");
    });
  });

  describe("TV-SEARCH-003: Without searchProvider, DB-native fallback is used when supported", () => {
    it("should execute DFQL search via DB-native fallback", async () => {
      const db = memoryAdapter({ namespace: "datafn" }) as any;
      db.capabilities.operations.fulltext = true;
      const server = await createDatafnServer({
        allowUnknownResources: true,
        schema: dfqlSchema,
        db,
      });

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-fallback",
            id: "task:f1",
            record: { title: "Fallback report" },
          }),
        }),
      );

      const response = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id", "title"],
            search: { query: "report", type: "fullText", fields: ["title"] },
          }),
        }),
      );
      const result: any = await response.json();

      expect(result.ok).toBe(true);
      expect(result.result.data).toHaveLength(1);
      expect(result.result.data[0].id).toBe("task:f1");
    });
  });
});
