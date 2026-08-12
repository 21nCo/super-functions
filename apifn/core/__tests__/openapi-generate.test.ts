import SwaggerParser from "@apidevtools/swagger-parser";
import { Type } from "@sinclair/typebox";
import { createRouter } from "@superfunctions/http";
import { z } from "zod";
import {
  apiSchema,
  fromRouter,
  generateOpenAPI,
  introspectRouter,
  type IntrospectedRoute,
} from "../src/index.js";

describe("OpenAPI generation", () => {
  it("TV-OPENAPI-001: generates a valid OpenAPI 3.1 document", async () => {
    const routes: IntrospectedRoute[] = [
      {
        method: "GET",
        path: "/users",
        parameters: [],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: z.array(z.object({ id: z.string() })),
              },
            },
          },
        },
        meta: {},
      },
    ];

    const doc = generateOpenAPI(routes, {
      info: { title: "Test API", version: "1.0.0" },
    });

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Test API");
    expect(doc.paths["/users"]?.get).toBeDefined();
    await expect(SwaggerParser.validate(doc as object)).resolves.toBeDefined();
  });

  it("TV-OPENAPI-002: creates one operation per method/path and auto operationId", () => {
    const routes: IntrospectedRoute[] = [
      {
        method: "GET",
        path: "/users",
        operationId: "getUsers",
        parameters: [],
        responses: { "200": { description: "Success" } },
        meta: {},
      },
      {
        method: "POST",
        path: "/users",
        operationId: "createUser",
        parameters: [],
        responses: { "201": { description: "Created" } },
        meta: {},
      },
      {
        method: "GET",
        path: "/users/{id}",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Success" } },
        meta: {},
      },
    ];

    const doc = generateOpenAPI(routes, {
      info: { title: "Test API", version: "1.0.0" },
    });

    expect(doc.paths["/users"]?.get?.operationId).toBe("getUsers");
    expect(doc.paths["/users"]?.post?.operationId).toBe("createUser");
    expect(doc.paths["/users/{id}"]?.get?.operationId).toBe("getUsersId");
  });

  it("TV-OPENAPI-003: maps path/query/header parameters", () => {
    const route: IntrospectedRoute = {
      method: "GET",
      path: "/users/{id}",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "fields", in: "query", required: false, schema: z.string().optional() },
        { name: "x-trace-id", in: "header", required: false, schema: Type.String() },
      ],
      responses: { "200": { description: "Success" } },
      meta: {},
    };

    const doc = generateOpenAPI([route], {
      info: { title: "Test API", version: "1.0.0" },
    });

    expect(doc.paths["/users/{id}"]?.get?.parameters).toEqual(
      expect.arrayContaining([
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
        },
        {
          in: "query",
          name: "fields",
          required: false,
          schema: { type: "string" },
        },
        {
          in: "header",
          name: "x-trace-id",
          required: false,
          schema: { type: "string" },
        },
      ])
    );
  });

  it("OPENAPI-004 + OPENAPI-005: generates requestBody, responses, defaults and headers", () => {
    const routes: IntrospectedRoute[] = [
      {
        method: "POST",
        path: "/users",
        parameters: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.object({ name: z.string() }),
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: Type.Object({ id: Type.String() }),
              },
            },
            headers: {
              "x-request-id": {
                schema: { type: "string" },
                description: "Request id",
              },
            },
          },
        },
        meta: {},
      },
      {
        method: "GET",
        path: "/health",
        parameters: [],
        responses: {},
        meta: {},
      },
    ];

    const doc = generateOpenAPI(routes, {
      info: { title: "Test API", version: "1.0.0" },
    });

    expect(
      doc.paths["/users"]?.post?.requestBody?.content["application/json"]?.schema
    ).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
    expect(doc.paths["/users"]?.post?.requestBody?.required).toBe(true);
    expect(doc.paths["/users"]?.post?.responses?.["201"]).toMatchObject({
      description: "Created",
      headers: {
        "x-request-id": {
          description: "Request id",
          schema: { type: "string" },
        },
      },
    });
    expect(doc.paths["/health"]?.get?.responses?.["200"]).toEqual({
      description: "Success",
    });
  });

  it("OPENAPI-006 + OPENAPI-007 + OPENAPI-008: tags, security schemes, operation security and servers", () => {
    const routes: IntrospectedRoute[] = [
      {
        method: "GET",
        path: "/users",
        tags: ["users", "public"],
        security: [{ bearerAuth: [] }],
        parameters: [],
        responses: { "200": { description: "Success" } },
        meta: {},
      },
      {
        method: "GET",
        path: "/orders",
        tags: ["orders", "public"],
        parameters: [],
        responses: { "200": { description: "Success" } },
        meta: {},
      },
    ];

    const withServers = generateOpenAPI(routes, {
      info: { title: "Test API", version: "1.0.0" },
      servers: [
        { url: "https://api.example.com", description: "prod" },
        { url: "https://staging.example.com", description: "staging" },
      ],
      securitySchemes: {
        apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
        bearerAuth: { type: "http", scheme: "bearer" },
        oauth2Auth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "https://example.com/auth",
              tokenUrl: "https://example.com/token",
              scopes: { "read:users": "Read users" },
            },
          },
        },
        openIdAuth: { type: "openIdConnect", openIdConnectUrl: "https://example.com/.well-known/openid-configuration" },
      },
    });

    expect(withServers.tags?.map((tag) => tag.name)).toEqual([
      "orders",
      "public",
      "users",
    ]);
    expect(withServers.components?.securitySchemes?.apiKeyAuth).toBeDefined();
    expect(withServers.components?.securitySchemes?.bearerAuth).toBeDefined();
    expect(withServers.components?.securitySchemes?.oauth2Auth).toBeDefined();
    expect(withServers.components?.securitySchemes?.openIdAuth).toBeDefined();
    expect(withServers.paths["/users"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(withServers.servers).toEqual([
      { description: "prod", url: "https://api.example.com" },
      { description: "staging", url: "https://staging.example.com" },
    ]);

    const withoutServers = generateOpenAPI(routes, {
      info: { title: "Test API", version: "1.0.0" },
    });

    expect(withoutServers.servers).toBeUndefined();
  });

  it("TV-OPENAPI-009: output is deterministic", () => {
    const routes: IntrospectedRoute[] = [
      {
        method: "GET",
        path: "/users/{id}",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: z.object({ id: z.string(), name: z.string() }),
              },
            },
          },
        },
        tags: ["users"],
        meta: {},
      },
    ];

    const options = {
      info: { title: "Deterministic API", version: "1.0.0" },
      extensions: { generatedBy: "apifn" },
    };

    const first = generateOpenAPI(routes, options);
    const second = generateOpenAPI(routes, options);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("TV-OPENAPI-010: fromRouter matches introspect+generate", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/api/users/:id",
          handler: async () => Response.json({}),
          meta: apiSchema({
            operationId: "getUserById",
            summary: "Get user",
            query: { fields: z.string().optional() },
            responses: {
              200: {
                description: "OK",
                schema: z.object({ id: z.string() }),
              },
            },
          }),
        },
      ],
    });

    const options = {
      info: { title: "Router API", version: "1.0.0" },
      include: ["/api"],
      servers: [{ url: "https://api.example.com" }],
    };

    const direct = fromRouter(router, options);
    const manual = generateOpenAPI(
      introspectRouter(router, {
        include: options.include,
      }),
      {
        info: options.info,
        servers: options.servers,
      }
    );

    expect(direct).toEqual(manual);
  });
});
