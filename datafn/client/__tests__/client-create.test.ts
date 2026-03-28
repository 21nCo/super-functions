/**
 * Client Creation Tests - Phase 00
 * Tests TV-CLIENT-001, TV-CLIENT-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnClientError } from "../src/errors.js";

// Stub remote adapter for testing
const stubRemote = {
  query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
  mutation: async () => ({ ok: true, result: { ok: true } }),
  transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
  seed: async () => ({ ok: true, result: { ok: true } }),
  clone: async () => ({ ok: true, result: { ok: true } }),
  pull: async () => ({ ok: true, result: { ok: true } }),
  push: async () => ({ ok: true, result: { ok: true } }),
};

describe("@datafn/client creation", () => {
  it("TV-CLIENT-001: Creating a client with a valid schema succeeds", () => {
    const schema = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "title", type: "string" as const, required: true }],
        },
      ],
    };

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    expect(client).toBeDefined();
    expect(typeof client.mutate).toBe("function");
    expect(typeof client.subscribe).toBe("function");
  });

  it("TV-CLIENT-002: Invalid schema is rejected with SCHEMA_INVALID", () => {
    const invalidSchema = {
      relations: [],
      // missing 'resources'
    };

    expect(() => {
      createDatafnClient({
        schema: invalidSchema as any,
        sync: { remote: "http://example.com" },
        clientId: "test-client",
      });
    }).toThrow();

    try {
      createDatafnClient({
        schema: invalidSchema as any,
        sync: { remote: "http://example.com" },
        clientId: "test-client",
      });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("SCHEMA_INVALID");
      expect(err.message).toBe("Invalid schema: missing resources");
      expect(err.details).toEqual({ path: "resources" });
    }
  });

  it("TV-CFG-001: remoteAdapter is used for remote calls", async () => {
    const callLog: any[] = [];
    const fakeAdapter = {
      query: async (q: unknown) => {
        callLog.push({ method: "query", payload: q });
        return { ok: true, result: { data: [], nextCursor: null } };
      },
      mutation: async (m: unknown) => {
        callLog.push({ method: "mutation", payload: m });
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: "m-1",
            affectedIds: [],
            errors: [],
            deduped: false,
          },
        };
      },
      transact: async () => ({
        ok: true,
        result: { ok: true, results: [] },
      }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const schema = {
      resources: [
        {
          name: "node",
          version: 1,
          fields: [],
        },
      ],
    };

    const client = createDatafnClient({
      schema,
      sync: { mode: "sync", remoteAdapter: fakeAdapter },
      clientId: "client:dev-1",
    });

    await client.query({ resource: "node", version: 1, select: ["id"] });

    expect(callLog.length).toBe(1);
    expect(callLog[0].method).toBe("query");
  });

  it("TV-CFG-001N: mode:sync without remote or remoteAdapter is rejected", () => {
    const schema = {
      resources: [{ name: "node", version: 1, fields: [] }],
    };

    expect(() => {
      createDatafnClient({
        schema,
        sync: { mode: "sync" },
        clientId: "client:dev-1",
      });
    }).toThrow();

    try {
      createDatafnClient({
        schema,
        sync: { mode: "sync" },
        clientId: "client:dev-1",
      });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe(
        "Invalid client config: remote or remoteAdapter is required in sync mode",
      );
      expect(err.details).toEqual({ path: "sync" });
    }
  });

  it("TV-CFG-002: Local-only mode executes mutate/query locally without remote", async () => {
    const { MemoryStorageAdapter } = await import(
      "../src/adapters/memoryStorage.js"
    );

    const schema = {
      resources: [
        {
          name: "node",
          version: 1,
          fields: [{ name: "label", type: "string" as const, required: false }],
        },
      ],
    };

    const client = createDatafnClient({
      schema,
      sync: { mode: "local-only", offlinability: true },
      storage: new MemoryStorageAdapter(),
      clientId: "client:guest-1",
    });

    const mutateResult = await client.mutate({
      resource: "node",
      version: 1,
      operation: "insert",
      id: "node:1",
      record: { label: "A" },
      clientId: "client:guest-1",
      mutationId: "m-1",
    });

    expect(mutateResult).toHaveProperty("ok", true);
    expect(mutateResult).toHaveProperty("affectedIds");

    const queryResult = (await client.query({
      resource: "node",
      version: 1,
      select: ["id", "label"],
    })) as any;

    expect(queryResult.data).toEqual([{ id: "node:1", label: "A" }]);
  });

  it("TV-CFG-002N: Local-only mode without storage but with offlinability is rejected", () => {
    const schema = {
      resources: [{ name: "node", version: 1, fields: [] }],
    };

    expect(() => {
      createDatafnClient({
        schema,
        sync: { mode: "local-only", offlinability: true },
        clientId: "client:guest-1",
      });
    }).toThrow();

    try {
      createDatafnClient({
        schema,
        sync: { mode: "local-only", offlinability: true },
        clientId: "client:guest-1",
      });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe(
        "Invalid client config: storage is required when offlinability is true",
      );
      expect(err.details).toEqual({ path: "storage" });
    }
  });

  /**
   * PHASE_12 Tests: Configurable Pull Batch Size (CFG-001)
   * Tests TV-CFG-001 and TV-CFG-001N
   */
  it("TV-CFG-001: pullBatchSize configures pull limit", () => {
    const schema = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "title", type: "string" as const, required: true }],
        },
      ],
    };

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com", pullBatchSize: 500 },
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    // Verify client was created successfully
    expect(client).toBeDefined();
  });

  it("TV-CFG-001N: Invalid pullBatchSize rejected at init", () => {
    const schema = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "title", type: "string" as const, required: true }],
        },
      ],
    };

    // Test negative value
    expect(() => {
      createDatafnClient({
        schema,
        sync: { remote: "http://example.com", pullBatchSize: -1 },
        clientId: "test-client",
      });
    }).toThrow();

    // Test too small value
    expect(() => {
      createDatafnClient({
        schema,
        sync: { remote: "http://example.com", pullBatchSize: 5 },
        clientId: "test-client",
      });
    }).toThrow();

    // Test too large value
    expect(() => {
      createDatafnClient({
        schema,
        sync: { remote: "http://example.com", pullBatchSize: 20000 },
        clientId: "test-client",
      });
    }).toThrow();

    // Test non-integer value
    expect(() => {
      createDatafnClient({
        schema,
        sync: { remote: "http://example.com", pullBatchSize: 100.5 },
        clientId: "test-client",
      });
    }).toThrow();

    // Verify the error details
    try {
      createDatafnClient({
        schema,
        sync: { remote: "http://example.com", pullBatchSize: -1 },
        clientId: "test-client",
      });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe(
        "Invalid client config: pullBatchSize must be a positive integer between 10 and 10000",
      );
      expect(err.details).toEqual({ path: "sync.pullBatchSize" });
    }
  });
});
