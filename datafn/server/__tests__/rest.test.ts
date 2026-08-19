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
    const { router } = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...mutationPayload, operation: "insert" }),
      }),
    );

    const postJson = await postRes.json();
    if (!postJson.ok) {
      console.error("REST POST failed:", JSON.stringify(postJson, null, 2));
    }
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

  describe("SEC-010: Path traversal protection", () => {
    it("TV-SEC-031: encoded slash %2F in resource returns 400", async () => {
      const { router } = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: memoryAdapter(),
        rest: true,
      });

      const res = await router.handle(
        new Request("http://localhost/datafn/resources/users%2F..%2Fadmin", {
          method: "GET",
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("DFQL_INVALID");
    });

    it("TV-SEC-032: dot-dot in resource returns 400", async () => {
      const { router } = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: memoryAdapter(),
        rest: true,
      });

      // Simulate a request where path parsing produces ".." segment
      // We test directly via sanitizePathSegment by checking encoded variants
      const res = await router.handle(
        new Request("http://localhost/datafn/resources/task%2F..%2Fadmin", {
          method: "GET",
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("DFQL_INVALID");
    });

    it("SEC-010: null byte in resource returns 400", async () => {
      const { router } = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: memoryAdapter(),
        rest: true,
      });

      const res = await router.handle(
        new Request("http://localhost/datafn/resources/task%00evil", {
          method: "GET",
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("DFQL_INVALID");
    });
  });

  it("TV-REST-002: Unknown resource rejection", async () => {
    const { router } = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: memoryAdapter(),
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

  it("keeps REST resource/version scoped to the URL and preserves namespace context", async () => {
    const db = memoryAdapter();
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema: {
        resources: [
          {
            name: "task",
            version: 1,
            fields: [{ name: "title", type: "string", required: true }],
          },
          {
            name: "note",
            version: 7,
            fields: [{ name: "title", type: "string", required: true }],
          },
        ],
      } as DatafnSchema,
      database: db,
      rest: true,
      namespaceProvider: {
        getNamespace: (ctx: { tenant: string }) => `ns:${ctx.tenant}`,
      },
    });

    const postRes = await server.router.handle(
      new Request("http://localhost/datafn/resources/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "insert",
          resource: "note",
          version: 99,
          clientId: "client:rest",
          mutationId: "m-rest-scope",
          id: "task:scoped",
          record: { title: "Scoped task" },
        }),
      }),
      { tenant: "alpha" },
    );

    expect(postRes.status).toBe(200);
    expect(
      await db.findOne({
        model: "task",
        where: [{ field: "id", operator: "eq", value: "task:scoped" }],
        namespace: "ns:alpha",
      }),
    ).toBeTruthy();
    expect(
      await db.findOne({
        model: "note",
        where: [{ field: "id", operator: "eq", value: "task:scoped" }],
        namespace: "ns:alpha",
      }),
    ).toBeNull();

    const getRes = await server.router.handle(
      new Request(
        `http://localhost/datafn/resources/task?q=${encodeURIComponent(
          JSON.stringify({
            resource: "note",
            version: 123,
            filters: { id: "task:scoped" },
            select: ["id", "title"],
          }),
        )}`,
        { method: "GET" },
      ),
      { tenant: "alpha" },
    );

    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);
    expect(getJson.result.data).toEqual([{ id: "task:scoped", title: "Scoped task" }]);
  });
});
