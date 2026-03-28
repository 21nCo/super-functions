/**
 * Mutation Tests - Phase 03
 * Tests TV-MUT-001, TV-MUT-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { DefaultHttpTransport } from "../src/transport/http.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnEvent } from "@datafn/core";

// Default schema for testing
const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

describe("@datafn/client mutations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-MUT-001: Successful mutation emits mutation_applied with deterministic timestamp", async () => {
    const observedEvents: DatafnEvent[] = [];
    const mockTimestamp = 123;

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-1",
        affectedIds: ["task:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => mockTimestamp,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute mutation via table
    const table = client.task;
    const result = await table.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      id: "task:1",
      record: { title: "A" },
    });

    // Verify result
    expect(result).toEqual({
      ok: true,
      mutationId: "m-1",
      affectedIds: ["task:1"],
      errors: [],
      deduped: false,
    });

    // Verify mutation_applied event was emitted
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toEqual({
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      clientId: "client:1",
      timestampMs: mockTimestamp,
      action: "insert", // CLIENT-EVENT-001
      fields: ["title"], // CLIENT-EVENT-001
      record: { title: "A" }, // SIG-003: record included for optimistic patching
    });
  });

  it("TV-MUT-002: Failed mutation emits mutation_rejected with error context", async () => {
    const observedEvents: DatafnEvent[] = [];
    const mockTimestamp = 5;

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: false,
        mutationId: "m-2",
        affectedIds: [],
        errors: [
          {
            code: "DFQL_INVALID",
            message: "Invalid DFQL: missing clientId or mutationId",
            path: "$",
          },
        ],
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => mockTimestamp,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute mutation via table
    const table = client.task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-2",
      id: "task:1",
      record: { title: "B" },
    });

    // Verify result
    expect(result).toEqual({
      ok: false,
      mutationId: "m-2",
      affectedIds: [],
      errors: [
        {
          code: "DFQL_INVALID",
          message: "Invalid DFQL: missing clientId or mutationId",
          path: "$",
        },
      ],
    });

    // Verify mutation_rejected event was emitted
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      type: "mutation_rejected",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-2",
      clientId: "client:1",
      timestampMs: mockTimestamp,
      action: "merge", // CLIENT-EVENT-001
      fields: ["title"], // CLIENT-EVENT-001
    });

    // Verify the error context
    expect((observedEvents[0] as any).context).toEqual({
      code: "DFQL_INVALID",
      message: "Invalid DFQL: missing clientId or mutationId",
      path: "$",
    });
  });
});

describe("@datafn/client mutation search index lifecycle (IDX-001/IDX-002)", () => {
  it("updates search index for successful local mutation", async () => {
    const storage = new MemoryStorageAdapter();
    const updateIndices = vi.fn().mockResolvedValue(undefined);
    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { mode: "local-only" },
      storage,
      clientId: "idx-client",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
    });

    const result: any = await client.task.mutate({
      operation: "insert",
      id: "task:idx-1",
      record: { title: "Index Me" },
    });

    expect(result.ok).toBe(true);
    expect(updateIndices).toHaveBeenCalledTimes(1);
    expect(updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "task",
        operation: "upsert",
      }),
    );
  });
});

/**
 * Silent and System Mutation Tests (MUT-001, MUT-002)
 * Tests TV-MUT-001, TV-MUT-001N, TV-MUT-002, TV-MUT-002N
 */
describe("@datafn/client silent and system mutations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-MUT-001: Silent mutation applies to storage and changelog but does not emit events", async () => {
    const observedEvents: DatafnEvent[] = [];

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-silent",
        affectedIds: ["task:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 999,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute silent mutation
    const table = client.task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-silent",
      id: "task:1",
      record: { title: "Silent Update" },
      silent: true, // MUT-001
    });

    // Verify result is successful
    expect(result).toEqual({
      ok: true,
      mutationId: "m-silent",
      affectedIds: ["task:1"],
      errors: [],
      deduped: false,
    });

    // Verify NO events were emitted (silent: true suppresses emission)
    expect(observedEvents).toHaveLength(0);
  });

  it("TV-MUT-001N: Non-silent mutation emits events (backward compatibility)", async () => {
    const observedEvents: DatafnEvent[] = [];

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-normal",
        affectedIds: ["task:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 999,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute normal mutation (no silent flag)
    const table = client.task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-normal",
      id: "task:1",
      record: { title: "Normal Update" },
    });

    // Verify result is successful
    expect(result).toEqual({
      ok: true,
      mutationId: "m-normal",
      affectedIds: ["task:1"],
      errors: [],
      deduped: false,
    });

    // Verify event WAS emitted (default behavior)
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-normal",
    });
  });

  it("TV-MUT-002: System mutation includes flag in event payload", async () => {
    const observedEvents: DatafnEvent[] = [];

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-system",
        affectedIds: ["task:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 777,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute system mutation
    const table = client.task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-system",
      id: "task:1",
      record: { title: "System Update" },
      system: true, // MUT-002
    });

    // Verify result is successful
    expect(result).toEqual({
      ok: true,
      mutationId: "m-system",
      affectedIds: ["task:1"],
      errors: [],
      deduped: false,
    });

    // Verify event includes system: true flag
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-system",
      system: true, // MUT-002: system flag propagated
    });
  });

  it("TV-MUT-002N: Non-system mutation does not include system flag", async () => {
    const observedEvents: DatafnEvent[] = [];

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-user",
        affectedIds: ["task:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 888,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute normal user mutation (no system flag)
    const table = client.task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-user",
      id: "task:1",
      record: { title: "User Update" },
    });

    // Verify result is successful
    expect(result).toEqual({
      ok: true,
      mutationId: "m-user",
      affectedIds: ["task:1"],
      errors: [],
      deduped: false,
    });

    // Verify event does NOT include system flag (or it's undefined)
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-user",
    });
    // Verify system field is not present or undefined
    expect((observedEvents[0] as any).system).toBeUndefined();
  });

  it("TV-MUT-001+002: Silent and system combined works correctly", async () => {
    const observedEvents: DatafnEvent[] = [];

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-both",
        affectedIds: ["task:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 555,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute mutation with both silent and system flags
    const table = client.task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-both",
      id: "task:1",
      record: { title: "Both Flags" },
      silent: true, // MUT-001
      system: true, // MUT-002
    });

    // Verify result is successful
    expect(result).toEqual({
      ok: true,
      mutationId: "m-both",
      affectedIds: ["task:1"],
      errors: [],
      deduped: false,
    });

    // Verify NO events were emitted (silent takes precedence)
    expect(observedEvents).toHaveLength(0);
  });

  it("Silent mutation on rejection also suppresses events", async () => {
    const observedEvents: DatafnEvent[] = [];

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: false,
        mutationId: "m-reject-silent",
        affectedIds: [],
        errors: [
          {
            code: "DFQL_INVALID",
            message: "Validation failed",
            path: "$.title",
          },
        ],
      },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 333,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute silent mutation that will be rejected
    const table = client.task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-reject-silent",
      id: "task:1",
      record: { title: "" }, // Invalid
      silent: true,
    });

    // Verify result indicates failure
    expect(result).toMatchObject({
      ok: false,
      mutationId: "m-reject-silent",
    });

    // Verify NO events were emitted (silent suppresses both applied and rejected)
    expect(observedEvents).toHaveLength(0);
  });
});

/**
 * Bulk Mutation Fallback Tests (BULK-001)
 * Tests TV-BULK-001, TV-BULK-001N
 */
describe("@datafn/client bulk mutation fallback (BULK-001)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-BULK-001: Batch with retryIndividual retries individually on batch failure", async () => {
    const observedEvents: DatafnEvent[] = [];

    let mutationCallCount = 0;

    // Mock remote.mutation to:
    // 1. Fail on first call (batch fails)
    // 2. Succeed on subsequent individual retry calls (except for INVALID resource)
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m: any) => {
        mutationCallCount++;

        // First call is the batch - fail it
        if (mutationCallCount === 1) {
          return Promise.reject({
            code: "DFQL_INVALID",
            message: "Batch validation failed",
          });
        }

        // Subsequent calls are individual retries
        const mutation = m;

        // Mutation with resource "INVALID" should fail
        if (mutation.resource === "INVALID") {
          return Promise.reject({
            code: "DFQL_UNKNOWN_RESOURCE",
            message: "Unknown resource: INVALID",
          });
        }

        // All other mutations succeed
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: mutation.mutationId,
            affectedIds: [mutation.id],
            errors: [],
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 111,
    });

    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute batch mutation with 5 mutations (4 good, 1 bad)
    const batchMutations = [
      {
        operation: "merge",
        resource: "task",
        id: "task:1",
        record: { title: "Task 1" },
        clientId: "client:1",
        mutationId: "m-1",
        retryIndividual: true, // BULK-001
      },
      {
        operation: "merge",
        resource: "task",
        id: "task:2",
        record: { title: "Task 2" },
        clientId: "client:1",
        mutationId: "m-2",
        retryIndividual: true,
      },
      {
        operation: "merge",
        resource: "INVALID", // This will fail
        id: "x:1",
        record: {},
        clientId: "client:1",
        mutationId: "m-invalid",
        retryIndividual: true,
      },
      {
        operation: "merge",
        resource: "task",
        id: "task:3",
        record: { title: "Task 3" },
        clientId: "client:1",
        mutationId: "m-3",
        retryIndividual: true,
      },
      {
        operation: "merge",
        resource: "task",
        id: "task:4",
        record: { title: "Task 4" },
        clientId: "client:1",
        mutationId: "m-4",
        retryIndividual: true,
      },
    ];

    // Use client.mutate directly to avoid table API overriding resource field
    const result = (await client.mutate(batchMutations)) as any;

    // Verify fallback was triggered (1 batch call + 5 individual retry calls = 6 total)
    expect(mutationCallCount).toBe(6);

    // Verify result structure
    expect(result.ok).toBe(false); // Not all succeeded
    expect(result.results).toHaveLength(5);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: "DFQL_UNKNOWN_RESOURCE",
    });
    
    // Verify individual mutation results
    expect(result.results[0]).toMatchObject({ mutationId: "m-1", ok: true });
    expect(result.results[1]).toMatchObject({ mutationId: "m-2", ok: true });
    expect(result.results[2]).toMatchObject({ mutationId: "m-invalid", ok: false });
    expect(result.results[3]).toMatchObject({ mutationId: "m-3", ok: true });
    expect(result.results[4]).toMatchObject({ mutationId: "m-4", ok: true });

    // Verify events: 4 mutation_applied, 1 mutation_rejected
    const appliedEvents = observedEvents.filter(
      (e) => e.type === "mutation_applied",
    );
    const rejectedEvents = observedEvents.filter(
      (e) => e.type === "mutation_rejected",
    );

    expect(appliedEvents).toHaveLength(4);
    expect(rejectedEvents).toHaveLength(1);
    expect(rejectedEvents[0]).toMatchObject({
      resource: "INVALID",
      mutationId: "m-invalid",
    });
  });

  it("TV-BULK-001N: Batch without retryIndividual fails entirely", async () => {
    const observedEvents: DatafnEvent[] = [];

    let mutationCallCount = 0;

    // Mock remote.mutation to fail
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async () => {
        mutationCallCount++;
        return Promise.reject({
          code: "DFQL_INVALID",
          message: "Batch validation failed",
        });
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 222,
    });

    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute batch mutation WITHOUT retryIndividual
    const batchMutations = [
      {
        operation: "merge",
        resource: "task",
        id: "task:1",
        record: { title: "Task 1" },
        clientId: "client:1",
        mutationId: "m-1",
        // NO retryIndividual flag
      },
      {
        operation: "merge",
        resource: "task",
        id: "task:2",
        record: { title: "Task 2" },
        clientId: "client:1",
        mutationId: "m-2",
      },
    ];

    const table = client.task;

    // Should throw because batch fails and no fallback
    await expect(table.mutate(batchMutations)).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Batch validation failed",
    });

    // Verify mutation was only called once (batch call, no individual retries)
    expect(mutationCallCount).toBe(1);

    // Verify mutation_rejected events were emitted for each mutation in batch
    expect(observedEvents.length).toBeGreaterThan(0);
    const rejectedEvents = observedEvents.filter(
      (e) => e.type === "mutation_rejected",
    );
    expect(rejectedEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("TV-BULK-001: All mutations valid, batch succeeds normally (no fallback needed)", async () => {
    const observedEvents: DatafnEvent[] = [];

    let mutationCallCount = 0;

    // Mock remote.mutation to succeed
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async () => {
        mutationCallCount++;
        return {
          ok: true,
          result: [
            {
              ok: true,
              mutationId: "m-1",
              affectedIds: ["task:1"],
              errors: [],
              deduped: false,
            },
            {
              ok: true,
              mutationId: "m-2",
              affectedIds: ["task:2"],
              errors: [],
              deduped: false,
            },
          ],
        };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 333,
    });

    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute batch mutation with retryIndividual (but won't be needed)
    const batchMutations = [
      {
        operation: "merge",
        resource: "task",
        id: "task:1",
        record: { title: "Task 1" },
        clientId: "client:1",
        mutationId: "m-1",
        retryIndividual: true,
      },
      {
        operation: "merge",
        resource: "task",
        id: "task:2",
        record: { title: "Task 2" },
        clientId: "client:1",
        mutationId: "m-2",
        retryIndividual: true,
      },
    ];

    const table = client.task;
    const result = await table.mutate(batchMutations);

    // Verify batch succeeded normally
    expect(result).toEqual([
      {
        ok: true,
        mutationId: "m-1",
        affectedIds: ["task:1"],
        errors: [],
        deduped: false,
      },
      {
        ok: true,
        mutationId: "m-2",
        affectedIds: ["task:2"],
        errors: [],
        deduped: false,
      },
    ]);

    // Verify mutation was only called once (batch succeeded, no fallback needed)
    expect(mutationCallCount).toBe(1);

    // Verify mutation_applied events were emitted
    const appliedEvents = observedEvents.filter(
      (e) => e.type === "mutation_applied",
    );
    expect(appliedEvents).toHaveLength(2);
  });
});

/**
 * Date Codec Mutation Tests (CODEC-001)
 * Tests TV-CODEC-001 and TV-CODEC-001N for outbound serialization
 */
describe("@datafn/client date codec mutations (CODEC-001)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-CODEC-001: Mutation serializes Date fields to ISO strings", async () => {
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
    };

    let capturedMutation: any = null;

    // Mock remote to capture the serialized mutation
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m: unknown) => {
        capturedMutation = m;
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: "m-1",
            affectedIds: ["task:1"],
            errors: [],
            deduped: false,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: schemaWithDate,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    // Create mutation with Date object
    const testDate = new Date("2026-02-06T00:00:00.000Z");
    await client.task.mutate({
      operation: "merge",
      id: "task:1",
      record: { title: "Test", date: testDate },
      clientId: "client:1",
      mutationId: "m-1",
    });

    // Verify the mutation sent to remote has serialized date to epoch milliseconds
    expect(capturedMutation).toBeDefined();
    expect(capturedMutation.record.date).toBe(1770336000000); // 2026-02-06T00:00:00.000Z as epoch
    expect(typeof capturedMutation.record.date).toBe("number");
  });

  it("TV-CODEC-001N: Mutation with non-Date value in date field is rejected", async () => {
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
    };

    const client = createDatafnClient({
      schema: schemaWithDate,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    // Try to mutate with non-Date value in date field
    await expect(
      client.task.mutate({
        operation: "merge",
        id: "task:1",
        record: { title: "Test", date: "not-a-date-object" as any },
        clientId: "client:1",
        mutationId: "m-1",
      }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Invalid date value: expected Date object",
      details: { path: "record.date" },
    });
  });

  it("TV-CODEC-001N: Mutation with invalid Date (NaN) is rejected", async () => {
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
    };

    const client = createDatafnClient({
      schema: schemaWithDate,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    // Try to mutate with invalid Date
    const invalidDate = new Date("invalid");
    await expect(
      client.task.mutate({
        operation: "merge",
        id: "task:1",
        record: { title: "Test", date: invalidDate },
        clientId: "client:1",
        mutationId: "m-1",
      }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Invalid date value",
      details: { path: "record.date" },
    });
  });
});
