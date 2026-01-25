/**
 * REST Wrapper Tests
 * Tests TV-REST-001, TV-REST-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import type { DatafnSchema } from "@datafn/core";
import { memoryAdapter } from "@superfunctions/db/adapters";

const testSchema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
  relations: [],
};

describe("REST Wrappers", () => {
  it("TV-REST-001: REST query/mutation deletion delegation", async () => {
    // 1. Setup server with REST enabled
    const db = memoryAdapter();
    const { router } = await createDatafnServer({
      schema: testSchema,
      db,
      // @ts-ignore - 'rest' prop is dynamic
      rest: true,
    });

    // 2. Perform Mutation via REST POST
    const mutationPayload = {
      clientId: "client:1",
      mutationId: "m-rest1",
      id: "task:1",
      record: { title: "A" },
    };

    // We expect { operation: insert } default or explicit?
    // TV-REST-001 input includes "operation": "insert".
    // Our handler logic takes `body.operation`.

    const postRes = await router.handle(
      new Request("http://localhost/datafn/resources/task", {
        method: "POST",
        body: JSON.stringify({ ...mutationPayload, operation: "insert" }),
      }),
    );

    const postJson = await postRes.json();
    expect(postJson).toMatchObject({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-rest1",
        affectedIds: ["task:1"],
      },
    });

    // 3. Perform Query via REST GET
    // q={"select":["id","title"],"filters":{"id":"task:1"}}
    const q = JSON.stringify({
      select: ["id", "title"],
      filters: { id: "task:1" },
    });
    const getRes = await router.handle(
      new Request(
        `http://localhost/datafn/resources/task?q=${encodeURIComponent(q)}`,
        {
          method: "GET",
        },
      ),
    );

    const getJson = await getRes.json();
    expect(getJson).toMatchObject({
      ok: true,
      result: {
        data: [{ id: "task:1", title: "A" }],
      },
    });
  });

  it("TV-REST-002: Unknown resource rejection", async () => {
    const { router } = await createDatafnServer({
      schema: testSchema,
      db: memoryAdapter(),
      // @ts-ignore
      rest: true,
    });

    const res = await router.handle(
      new Request("http://localhost/datafn/resources/nope", {
        method: "GET",
      }),
    );

    expect(res.status).toBe(400); // Bad Request per implementation
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: {
        code: "DFQL_UNKNOWN_RESOURCE",
        message: "Unknown resource: nope",
      },
    });
  });
});
