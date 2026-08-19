import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnServer } from "../src/server";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";

describe("DFQL Transactions", () => {
  let server: any;
  let router: any;
  let adapter: any;

  const schema: DatafnSchema = {
    resources: [
      {
        name: "txn",
        version: 1,
        fields: [
          { name: "amount", type: "number" },
          { name: "status", type: "string" },
        ],
      },
      {
        name: "ledger",
        version: 1,
        fields: [{ name: "balance", type: "number" }],
      },
    ],
    relations: [],
  };

  beforeEach(async () => {
    adapter = memoryAdapter();
    server = await createDatafnServer({ allowUnknownResources: true,
      database: adapter,
      schema,
    });
    router = server.router;
  });

  // Helper
  async function transact(body: any) {
    const res = await router.handle(
      new Request("http://localhost/datafn/transact", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      {},
    );
    const json = await res.json();
    if (!res.ok || !json.ok)
      console.error("TEST TRANSACT ERROR:", JSON.stringify(json, null, 2));
    return json;
  }

  it("TV-TRX-001: Successful transaction", async () => {
    const res = await transact({
      steps: [
        {
          resource: "txn",
          version: 1,
          operation: "insert",
          clientId: "c1",
          mutationId: "m1",
          id: "t:1",
          record: { amount: 100, status: "ok" },
        },
        {
          resource: "ledger",
          version: 1,
          operation: "insert",
          clientId: "c1",
          mutationId: "m2",
          id: "l:1",
          record: { balance: 100 },
        },
      ],
    });

    // Envelope OK
    expect(res.ok).toBe(true);
    // Result OK
    const result = res.result;
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[0].mutationId).toBe("m1");
    expect(result.results[1].ok).toBe(true);
    expect(result.results[1].mutationId).toBe("m2");

    // Verify persistence
    // Verify persistence via query
    const queryRes = await router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "txn",
          version: 1,
          filters: { status: "ok" },
        }),
      }),
      {},
    );
    const queryJson = await queryRes.json();
    expect(queryJson.ok).toBe(true);
    expect(queryJson.result.data).toHaveLength(1);
    expect(queryJson.result.data[0].amount).toBe(100);
  });

  it("TV-TRX-002: Failed transaction (stop on error)", async () => {
    // First succeed, second fail, third must not execute
    const res = await transact({
      steps: [
        {
          resource: "txn",
          version: 1,
          operation: "insert",
          clientId: "c1",
          mutationId: "m3",
          id: "t:2",
          record: { amount: 200 },
        },
        {
          resource: "txn",
          version: 1,
          operation: "invalid_op",
          clientId: "c1",
          mutationId: "m4",
          id: "t:non_existent",
        },
        {
          resource: "txn",
          version: 1,
          operation: "insert",
          clientId: "c1",
          mutationId: "m5",
          id: "t:3",
          record: { amount: 300 },
        },
      ],
    });

    // Envelope is OK
    expect(res.ok).toBe(true);

    const result = res.result;
    // Result is NOT OK (partial success)
    expect(result.ok).toBe(false);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].ok).toBe(false);
    expect(result.results[1].error.code).toBe("DFQL_UNSUPPORTED");

    const queryRes = await router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "txn",
          version: 1,
        }),
      }),
      {},
    );
    const queryJson = await queryRes.json();
    expect(queryJson.ok).toBe(true);
    const ids = queryJson.result.data.map((row: { id: string }) => row.id);
    expect(ids).toContain("t:2");
    expect(ids).not.toContain("t:3");
  });

  it("TV-TRX-003: Validation error (no steps)", async () => {
    const res = await transact({});
    // Request-level validation error returns top-level ok:false
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("DFQL_INVALID");
    expect(res.error.message).toBe("Invalid DFQL: expected 'steps' array");
    expect(res.error.details.path).toBe("steps");
  });
});
