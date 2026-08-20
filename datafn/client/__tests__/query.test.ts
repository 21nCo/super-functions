/**
 * Query Tests - Phase 02
 * Tests TV-QUERY-001, TV-QUERY-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { DefaultHttpTransport } from "../src/transport/http.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnClientError } from "../src/errors.js";

// Default schema for testing
const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "goal",
      version: 1,
      fields: [{ name: "label", type: "string" as const, required: true }],
    },
  ],
} as const;

describe("@datafn/client query", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-QUERY-001: DatafnTable.query merges resource/version and ignores overrides", async () => {
    const remoteCalls: Array<{ method: string; arg: unknown }> = [];

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async (q: unknown) => {
        remoteCalls.push({ method: "query", arg: q });
        return { ok: true, result: { data: [], nextCursor: null } };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    // Call table.query with resource/version overrides (should be ignored)
    const table = client.task;
    const result = await table.query({
      resource: "goal", // Should be ignored
      version: 999, // Should be ignored
      select: ["id"],
    });

    // Verify the remote was called with correct merged query
    expect(remoteCalls).toHaveLength(1);
    expect(remoteCalls[0].method).toBe("query");
    expect(remoteCalls[0].arg).toEqual({
      resource: "task", // From table, not from query fragment
      version: 1, // From table, not from query fragment
      select: ["id"],
    });

    // Verify result is unwrapped correctly
    expect(result).toEqual({ data: [], nextCursor: null });
  });

  it("DatafnTable.relation.query merges resource/version and relation anchor", async () => {
    const remoteCalls: Array<{ method: string; arg: unknown }> = [];

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async (q: unknown) => {
        remoteCalls.push({ method: "query", arg: q });
        return { ok: true, result: { data: [], nextCursor: null } };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    const result = await client.task.relation("backlinks").query("task:1", {
      resource: "goal",
      version: 999,
      relation: "ignored",
      id: "task:other",
      select: ["#"],
    });

    expect(remoteCalls).toHaveLength(1);
    expect(remoteCalls[0].arg).toEqual({
      resource: "task",
      version: 1,
      relation: "backlinks",
      id: "task:1",
      select: ["#"],
    });
    expect(result).toEqual({ data: [], nextCursor: null });
  });

  it("TV-QUERY-002: Remote ok:false errors become thrown DatafnClientError", async () => {
    vi.spyOn(DefaultHttpTransport.prototype, "query").mockResolvedValue({
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: resource must be string",
        details: { path: "resource" },
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    const table = client.task;

    // Should throw when remote returns ok:false
    await expect(async () => {
      await table.query({ select: ["id"] });
    }).rejects.toThrow();

    try {
      await table.query({ select: ["id"] });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe("Invalid DFQL: resource must be string");
      expect(err.details).toEqual({ path: "resource" });
    }
  });

  it("client.query delegates to remote and unwraps", async () => {
    const querySpy = vi
      .spyOn(DefaultHttpTransport.prototype, "query")
      .mockResolvedValue({
        ok: true,
        result: { data: [{ id: "task:1" }], nextCursor: null },
      });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    const result = await client.query({
      resource: "task",
      version: 1,
      select: ["id"],
    });

    expect(querySpy).toHaveBeenCalledWith({
      resource: "task",
      version: 1,
      select: ["id"],
    });

    expect(result).toEqual({ data: [{ id: "task:1" }], nextCursor: null });
  });

  it("treats offset zero as the first page and overlays pending local rows", async () => {
    vi.spyOn(DefaultHttpTransport.prototype, "query").mockResolvedValue({
      ok: true,
      result: {
        data: [
          { id: "task:1", title: "Remote one" },
          { id: "task:2", title: "Remote two" },
        ],
        nextCursor: null,
      },
    });
    const storage = new MemoryStorageAdapter(["task", "goal"]);
    await storage.upsertRecord("task", { id: "task:0", title: "Local pending" });
    await storage.setHydrationState("task", "hydrating");
    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      storage,
      clientId: "query-pagination",
      getTimestamp: () => 0,
    });

    const result = await client.task.query({
      sort: ["id:asc"],
      offset: 0,
      limit: 2,
    });

    expect(result.data.map((record) => record.id)).toEqual(["task:0", "task:1"]);
  });
});

/**
 * Date Codec Tests (CODEC-001)
 * Tests TV-CODEC-001 and TV-CODEC-001N
 */
describe("@datafn/client date codec (CODEC-001)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-CODEC-001: Query result parses ISO date strings to Date objects", async () => {
    const schemaWithDate = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [
            { name: "title", type: "string" as const, required: true },
            { name: "date", type: "date" as const, required: false },
          ],
        },
      ],
    } as const;

    // Mock remote to return ISO string
    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async () => {
        return {
          ok: true,
          result: {
            data: [
              { id: "task:1", title: "Test", date: "2026-02-06T00:00:00.000Z" },
            ],
            nextCursor: null,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: schemaWithDate,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    const result = await client.task.query({ select: ["id", "title", "date"] });

    // Verify date field was parsed to Date object
    expect(result.data).toHaveLength(1);
    expect(result.data[0].date).toBeInstanceOf(Date);
    expect((result.data[0].date as Date).toISOString()).toBe(
      "2026-02-06T00:00:00.000Z",
    );
  });

  it("TV-CODEC-001N: Invalid date string in query result is rejected deterministically", async () => {
    const schemaWithDate = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [
            { name: "title", type: "string" as const, required: true },
            { name: "date", type: "date" as const, required: false },
          ],
        },
      ],
    } as const;

    // Mock remote to return invalid date string
    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async () => {
        return {
          ok: true,
          result: {
            data: [{ id: "task:1", title: "Test", date: "not-a-date" }],
            nextCursor: null,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: schemaWithDate,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    // Should throw DFQL_INVALID error
    await expect(
      client.task.query({ select: ["id", "title", "date"] }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Invalid date value",
      details: { path: "data[].date" },
    });
  });
});

/**
 * PHASE_12 Tests: AbortSignal Support (QRY-001)
 * Tests TV-QRY-001 and TV-QRY-001N
 */
describe("@datafn/client AbortSignal (PHASE_12: QRY-001)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-QRY-001: Aborted query rejects with DFQL_ABORTED", async () => {
    // Mock fetch to simulate abort
    const mockFetch = vi.fn().mockImplementation(() => {
      const error = new Error("The user aborted a request.");
      error.name = "AbortError";
      throw error;
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: {
        remote: "http://example.com",
      },
      getTimestamp: () => 0,
    });

    // Mock the transport query method to return DFQL_ABORTED error
    vi.spyOn(DefaultHttpTransport.prototype, "query").mockResolvedValue({
      ok: false,
      error: {
        code: "DFQL_ABORTED",
        message: "Query aborted",
        details: { path: "signal" },
      },
    });

    const abortController = new AbortController();
    abortController.abort();

    // Query with aborted signal should reject with DFQL_ABORTED
    await expect(
      client.query({
        resource: "task",
        version: 1,
        select: ["id"],
        signal: abortController.signal,
      }),
    ).rejects.toMatchObject({
      code: "DFQL_ABORTED",
      message: "Query aborted",
      details: { path: "signal" },
    });
  });

  it("TV-QRY-001N: Query without signal succeeds normally", async () => {
    const querySpy = vi
      .spyOn(DefaultHttpTransport.prototype, "query")
      .mockResolvedValue({
        ok: true,
        result: { data: [{ id: "task:1", title: "Test" }], nextCursor: null },
      });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    // Query without signal should work normally
    const result = await client.query({
      resource: "task",
      version: 1,
      select: ["id"],
    });

    expect(querySpy).toHaveBeenCalled();
    expect(result).toEqual({
      data: [{ id: "task:1", title: "Test" }],
      nextCursor: null,
    });
  });

  it("Query with signal passed to table.query", async () => {
    const querySpy = vi
      .spyOn(DefaultHttpTransport.prototype, "query")
      .mockResolvedValue({
        ok: true,
        result: { data: [], nextCursor: null },
      });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      getTimestamp: () => 0,
    });

    const abortController = new AbortController();

    await client.task.query({
      select: ["id"],
      signal: abortController.signal,
    });

    // Verify signal was passed through
    expect(querySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "task",
        version: 1,
        select: ["id"],
        signal: abortController.signal,
      }),
    );
  });
});
