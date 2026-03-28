/**
 * ID Generation Tests
 * Tests for custom ID generator functionality
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { DefaultHttpTransport } from "../src/transport/http.js";

const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

describe("@datafn/client ID generation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses custom generateId function when provided", async () => {
    const customIds = [
      "task:custom-id-1",
      "task:custom-id-2",
      "task:custom-id-3",
    ];
    let idIndex = 0;
    const customGenerateId = vi.fn(
      ({ resource }: { resource: string; idPrefix?: string }) =>
        customIds[idIndex++],
    );

    let capturedMutation: unknown;
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m) => {
        capturedMutation = m;
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: "m-1",
            affectedIds: [(m as any).id],
            errors: [],
            deduped: false,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      generateId: customGenerateId,
    });

    await client.task.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      record: { title: "Test Task" },
    });

    expect(customGenerateId).toHaveBeenCalledTimes(1);
    expect(customGenerateId).toHaveBeenCalledWith({
      resource: "task",
      idPrefix: undefined,
    });
    expect((capturedMutation as any).id).toBe("task:custom-id-1");
  });

  it("uses crypto.randomUUID by default when no generateId is provided", async () => {
    let capturedMutation: unknown;
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m) => {
        capturedMutation = m;
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: "m-1",
            affectedIds: [(m as any).id],
            errors: [],
            deduped: false,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    await client.task.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      record: { title: "Test Task" },
    });

    const generatedId = (capturedMutation as any).id;
    expect(generatedId).toBeDefined();
    expect(typeof generatedId).toBe("string");
    // Default generator now adds resource prefix
    expect(generatedId).toMatch(/^task:/);
  });

  it("does not call generateId when id is already provided", async () => {
    const customGenerateId = vi.fn(() => "task:custom-id");

    let capturedMutation: unknown;
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m) => {
        capturedMutation = m;
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: "m-1",
            affectedIds: [(m as any).id],
            errors: [],
            deduped: false,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      generateId: customGenerateId,
    });

    await client.task.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      id: "user-provided-id",
      record: { title: "Test Task" },
    });

    expect(customGenerateId).not.toHaveBeenCalled();
    expect((capturedMutation as any).id).toBe("user-provided-id");
  });

  it("uses custom generateId for multiple tables", async () => {
    const multiTableSchema = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "title", type: "string" as const, required: true }],
        },
        {
          name: "project",
          version: 1,
          fields: [{ name: "name", type: "string" as const, required: true }],
        },
      ],
    };

    let callCount = 0;
    const customGenerateId = vi.fn(
      ({ resource }: { resource: string; idPrefix?: string }) =>
        `${resource}:custom-id-${++callCount}`,
    );

    const capturedMutations: unknown[] = [];
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m) => {
        capturedMutations.push(m);
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: "m-1",
            affectedIds: [(m as any).id],
            errors: [],
            deduped: false,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema: multiTableSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      generateId: customGenerateId,
    });

    await client.task.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      record: { title: "Task 1" },
    });

    await (client as any).project.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-2",
      record: { name: "Project 1" },
    });

    expect(customGenerateId).toHaveBeenCalledTimes(2);
    expect((capturedMutations[0] as any).id).toBe("task:custom-id-1");
    expect((capturedMutations[1] as any).id).toBe("project:custom-id-2");
  });

  it("only generates ID for insert operations", async () => {
    const customGenerateId = vi.fn(() => "custom-id");

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async () => ({
        ok: true,
        result: {
          ok: true,
          mutationId: "m-1",
          affectedIds: ["task:1"],
          errors: [],
          deduped: false,
        },
      }),
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      generateId: customGenerateId,
    });

    await client.task.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-1",
      id: "task:1",
      record: { title: "Updated" },
    });

    expect(customGenerateId).not.toHaveBeenCalled();
  });

  it("generates IDs for batch insert operations", async () => {
    let callCount = 0;
    const customGenerateId = vi.fn(
      ({ resource }: { resource: string; idPrefix?: string }) =>
        `${resource}:batch-id-${++callCount}`,
    );

    let capturedMutation: unknown;
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m) => {
        capturedMutation = m;
        const mutations = m as any[];
        return {
          ok: true,
          result: mutations.map((mut: any) => ({
            ok: true,
            mutationId: mut.mutationId,
            affectedIds: [mut.id],
            errors: [],
            deduped: false,
          })),
        };
      },
    );

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      generateId: customGenerateId,
    });

    await client.task.mutate([
      {
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-1",
        record: { title: "Task 1" },
      },
      {
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-2",
        record: { title: "Task 2" },
      },
    ]);

    expect(customGenerateId).toHaveBeenCalledTimes(2);
    const mutations = capturedMutation as any[];
    expect(mutations[0].id).toBe("task:batch-id-1");
    expect(mutations[1].id).toBe("task:batch-id-2");
  });

  it("TV-ID-001: Insert without id uses generateId({resource,idPrefix}) and respects prefix", async () => {
    const schema = {
      resources: [
        {
          name: "node",
          version: 1,
          idPrefix: "node",
          fields: [{ name: "label", type: "string" as const, required: false }],
        },
      ],
    };

    const customGenerateId = vi.fn(
      ({ resource, idPrefix }: { resource: string; idPrefix?: string }) =>
        `node:abc`,
    );

    let capturedMutation: unknown;
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async (m) => {
        capturedMutation = m;
        return {
          ok: true,
          result: {
            ok: true,
            mutationId: "m-1",
            affectedIds: [(m as any).id],
            errors: [],
            deduped: false,
          },
        };
      },
    );

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      generateId: customGenerateId,
    });

    await (client as any).node.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      record: { label: "X" },
    });

    expect(customGenerateId).toHaveBeenCalledWith({
      resource: "node",
      idPrefix: "node",
    });
    expect((capturedMutation as any).id).toBe("node:abc");
  });

  it("TV-ID-001N: Generator returns wrong prefix; client rejects deterministically", async () => {
    const schema = {
      resources: [
        {
          name: "node",
          version: 1,
          idPrefix: "node",
          fields: [],
        },
      ],
    };

    const customGenerateId = vi.fn(() => "goal:wrong");

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockImplementation(
      async () => ({
        ok: true,
        result: {
          ok: true,
          mutationId: "m-1",
          affectedIds: [],
          errors: [],
          deduped: false,
        },
      }),
    );

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      generateId: customGenerateId,
    });

    await expect(
      (client as any).node.mutate({
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-1",
        record: {},
      }),
    ).rejects.toThrow();

    try {
      await (client as any).node.mutate({
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-1",
        record: {},
      });
    } catch (error: any) {
      expect(error.code).toBe("DFQL_INVALID");
      expect(error.message).toBe("Invalid id: does not match required prefix");
      expect(error.details).toEqual({ path: "id" });
    }
  });
});
