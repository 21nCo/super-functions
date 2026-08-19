import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KV_RESOURCE_NAME,
  isDatafnE2eeEnvelope,
  type DatafnSchema,
} from "@datafn/core";
import {
  assertRemoteQueryAllowedForE2ee,
  assertRemoteSearchAllowedForE2ee,
  decryptCloneResultForE2ee,
  encryptMutationPayloadForE2ee,
  prepareTransactPayloadForE2ee,
  type DatafnE2eeProvider,
} from "../src/e2ee.js";
import { createDatafnClient } from "../src/client.js";
import { DefaultHttpTransport } from "../src/transport/http.js";

const schema: DatafnSchema = {
  capabilities: ["timestamps", "audit", "trash"],
  resources: [
    {
      name: "project",
      version: 1,
      fields: [{ name: "name", type: "string", required: true }],
    },
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "notes", type: "string", required: false, nullable: true },
        { name: "projectId", type: "string", required: false, nullable: true },
        { name: "parentId", type: "string", required: false, nullable: true },
        { name: "parentPath", type: "string", required: false, nullable: true },
      ],
    },
  ],
  relations: [
    { from: "project", to: "task", type: "one-many" },
    { from: "task", to: "task", type: "htree" },
  ],
};

function createProvider(): DatafnE2eeProvider {
  return {
    keyRef: "test-key",
    async encrypt({ plaintext, resource, id, field, aad }) {
      return {
        __datafnE2ee: 1,
        alg: "AES-GCM",
        keyRef: "test-key",
        iv: `${resource}:${id}:${field}`,
        data: JSON.stringify({
          plaintext: [...plaintext],
          aad: [...aad],
        }),
      };
    },
    async decrypt({ envelope }) {
      const parsed = JSON.parse(envelope.data) as { plaintext: number[] };
      return new Uint8Array(parsed.plaintext);
    },
  };
}

describe("DataFn E2EE client transforms", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts data fields while leaving capability and relationship fields plain", async () => {
    const record = {
      id: "task:1",
      title: "Ship E2EE",
      notes: "Local clone stays searchable",
      projectId: "project:1",
      parentId: "task:0",
      parentPath: "task:0",
      createdAt: 1710000000000,
      createdBy: "user:1",
      updatedAt: 1710000000001,
      updatedBy: "user:1",
      trashedAt: null,
      trashedBy: null,
    };

    const encrypted = (await encryptMutationPayloadForE2ee(
      schema,
      { enabled: true, provider: createProvider() },
      {
        operation: "insert",
        resource: "task",
        id: "task:1",
        record,
      },
    )) as { record: Record<string, unknown> };

    expect(isDatafnE2eeEnvelope(encrypted.record.title)).toBe(true);
    expect(isDatafnE2eeEnvelope(encrypted.record.notes)).toBe(true);
    expect(encrypted.record.id).toBe("task:1");
    expect(encrypted.record.projectId).toBe("project:1");
    expect(encrypted.record.parentId).toBe("task:0");
    expect(encrypted.record.parentPath).toBe("task:0");
    expect(encrypted.record.createdAt).toBe(1710000000000);
    expect(encrypted.record.createdBy).toBe("user:1");
    expect(encrypted.record.updatedAt).toBe(1710000000001);
    expect(encrypted.record.updatedBy).toBe("user:1");
    expect(encrypted.record.trashedAt).toBeNull();
    expect(encrypted.record.trashedBy).toBeNull();

    const decrypted = await decryptCloneResultForE2ee(
      schema,
      { enabled: true, provider: createProvider() },
      {
        ok: true,
        data: {
          task: [encrypted.record],
        },
        cursors: {},
        next: {},
      },
    );

    expect(decrypted.data.task?.[0]).toEqual(record);
  });

  it("blocks direct remote query and search while allowing plaintext KV query", () => {
    const e2ee = { enabled: true, provider: createProvider() };

    expect(() =>
      assertRemoteQueryAllowedForE2ee(e2ee, { resource: "task" }),
    ).toThrow("Direct server query is unavailable");
    expect(() => assertRemoteSearchAllowedForE2ee(e2ee)).toThrow(
      "Direct server search is unavailable",
    );
    expect(() =>
      assertRemoteQueryAllowedForE2ee(e2ee, { resource: KV_RESOURCE_NAME }),
    ).not.toThrow();
  });

  it("encrypts transaction mutation steps before remote transport", async () => {
    const prepared = await prepareTransactPayloadForE2ee(
      schema,
      { enabled: true, provider: createProvider() },
      {
        transactionId: "tx:e2ee",
        atomic: true,
        steps: [
          {
            mutation: {
              operation: "insert",
              resource: "task",
              id: "task:1",
              record: {
                id: "task:1",
                title: "Encrypted in transit",
                projectId: "project:1",
              },
            },
          },
        ],
      },
    ) as { steps: Array<{ mutation: { record: Record<string, unknown> } }> };

    expect(isDatafnE2eeEnvelope(prepared.steps[0]!.mutation.record.title)).toBe(true);
    expect(prepared.steps[0]!.mutation.record.projectId).toBe("project:1");
  });

  it("rejects transaction queries against encrypted resources", async () => {
    await expect(prepareTransactPayloadForE2ee(
      schema,
      { enabled: true, provider: createProvider() },
      {
        steps: [{ query: { resource: "task", select: ["id", "title"] } }],
      },
    )).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      details: { path: "query" },
    });
  });

  it("encrypts bare transaction mutations before transport", async () => {
    const transact = vi.spyOn(DefaultHttpTransport.prototype, "transact")
      .mockResolvedValue({ ok: true, result: { ok: true, results: [] } });
    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "e2ee-transact-client",
      e2ee: { enabled: true, provider: createProvider() },
    });

    await client.transact({
      steps: [{
        operation: "insert",
        resource: "task",
        id: "task:bare",
        record: { id: "task:bare", title: "Bare secret" },
      }],
    });

    const transported = transact.mock.calls[0]?.[0] as {
      steps: Array<{ record: Record<string, unknown> }>;
    };
    expect(isDatafnE2eeEnvelope(transported.steps[0]!.record.title)).toBe(true);
  });

  it("rejects bare encrypted-resource transaction queries before transport", async () => {
    const transact = vi.spyOn(DefaultHttpTransport.prototype, "transact")
      .mockResolvedValue({ ok: true, result: { ok: true, results: [] } });
    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "e2ee-query-client",
      e2ee: { enabled: true, provider: createProvider() },
    });

    await expect(client.transact({
      steps: [{ resource: "task", select: ["id", "title"] }],
    })).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      details: { path: "query" },
    });
    expect(transact).not.toHaveBeenCalled();
  });
});
