import { describe, expect, it } from "vitest";
import { createRouter } from "@superfunctions/http";
import { apiSchema, introspectRouter } from "../src/index.js";

describe("introspectRouter", () => {
  it("TV-INTRO-001 + TV-INTRO-002: extracts all routes with method/path and preserves ordering", () => {
    const router = createRouter({
      routes: [
        { method: "GET", path: "/users", handler: async () => Response.json([]) },
        {
          method: "POST",
          path: "/users",
          handler: async () => Response.json({}, { status: 201 }),
        },
      ],
    });

    const result = introspectRouter(router);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      method: "GET",
      path: "/users",
      parameters: [],
      responses: { "200": { description: "Success" } },
      meta: {},
    });
    expect(result[1]).toMatchObject({
      method: "POST",
      path: "/users",
      parameters: [],
      responses: { "200": { description: "Success" } },
      meta: {},
    });
  });

  it("TV-INTRO-003: parses descriptor fields and preserves zod-like schema references", () => {
    const zodBody = { _def: { typeName: "ZodObject" } } as const;
    const zodResponse = { _def: { typeName: "ZodObject" } } as const;

    const router = createRouter({
      routes: [
        {
          method: "POST",
          path: "/users",
          handler: async () => Response.json({}),
          meta: apiSchema({
            summary: "Create user",
            operationId: "createUser",
            tags: ["users"],
            body: zodBody,
            responses: {
              201: { description: "Created", schema: zodResponse },
              400: { description: "Validation error" },
            },
          }),
        },
      ],
    });

    const [route] = introspectRouter(router);

    expect(route.summary).toBe("Create user");
    expect(route.operationId).toBe("createUser");
    expect(route.tags).toEqual(["users"]);
    expect(route.requestBody?.content["application/json"]?.schema).toBe(zodBody);
    expect(route.responses["201"]?.content?.["application/json"]?.schema).toBe(zodResponse);
    expect(route.responses["400"]).toEqual({ description: "Validation error" });
  });

  it("TV-INTRO-004: parses TypeBox-like query and response schema descriptors", () => {
    const typeBoxQuery = {
      [Symbol.for("TypeBox.Kind")]: "Number",
      type: "number",
      minimum: 1,
      maximum: 100,
    };
    const typeBoxResponse = {
      [Symbol.for("TypeBox.Kind")]: "Array",
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
    };

    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/items",
          handler: async () => Response.json([]),
          meta: apiSchema({
            summary: "List items",
            query: { limit: typeBoxQuery },
            responses: {
              200: {
                description: "Item list",
                schema: typeBoxResponse,
              },
            },
          }),
        },
      ],
    });

    const [route] = introspectRouter(router);

    expect(route.parameters).toContainEqual({
      name: "limit",
      in: "query",
      required: false,
      schema: typeBoxQuery,
    });
    expect(route.responses["200"]?.content?.["application/json"]?.schema).toBe(typeBoxResponse);
  });

  it("TV-INTRO-005: converts path parameters and emits path parameter descriptors", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/orders/:orderId/items/:itemId",
          handler: async () => Response.json([]),
        },
      ],
    });

    const [route] = introspectRouter(router);

    expect(route.path).toBe("/orders/{orderId}/items/{itemId}");
    expect(route.parameters).toContainEqual({
      name: "orderId",
      in: "path",
      required: true,
      schema: { type: "string" },
    });
    expect(route.parameters).toContainEqual({
      name: "itemId",
      in: "path",
      required: true,
      schema: { type: "string" },
    });
  });

  it("TV-INTRO-006: applies include/exclude filtering by prefix", () => {
    const router = createRouter({
      routes: [
        { method: "GET", path: "/api/v1/users", handler: async () => Response.json([]) },
        { method: "GET", path: "/api/v1/orders", handler: async () => Response.json([]) },
        { method: "GET", path: "/internal/health", handler: async () => Response.json({}) },
        { method: "GET", path: "/internal/metrics", handler: async () => Response.json({}) },
      ],
    });

    expect(introspectRouter(router, { include: ["/api"] })).toHaveLength(2);
    expect(introspectRouter(router, { exclude: ["/internal"] })).toHaveLength(2);
    expect(
      introspectRouter(router, {
        include: ["/api"],
        exclude: ["/api/v1/orders"],
      })
    ).toHaveLength(1);
  });

  it("TV-INTRO-007: handles routes with undefined or empty meta using defaults", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/health",
          handler: async () => Response.json({ ok: true }),
          meta: undefined,
        },
        {
          method: "GET",
          path: "/ready",
          handler: async () => Response.json({ ok: true }),
          meta: {},
        },
      ],
    });

    const [health, ready] = introspectRouter(router);

    expect(health).toMatchObject({
      method: "GET",
      path: "/health",
      parameters: [],
      responses: { "200": { description: "Success" } },
      meta: {},
    });
    expect(ready).toMatchObject({
      method: "GET",
      path: "/ready",
      parameters: [],
      responses: { "200": { description: "Success" } },
      meta: {},
    });
  });

  it("applies basePath before conversion and filtering", () => {
    const router = createRouter({
      routes: [{ method: "GET", path: "/users/:id", handler: async () => Response.json({}) }],
    });

    const [route] = introspectRouter(router, { basePath: "/api/v1", include: ["/api"] });

    expect(route.path).toBe("/api/v1/users/{id}");
    expect(route.parameters).toContainEqual({
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string" },
    });
  });
});
