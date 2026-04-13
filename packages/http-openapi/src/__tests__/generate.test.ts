import { describe, expect, it } from "vitest";
import { createRouter } from "@superfunctions/http";
import { OpenApiGenerationError, generateOpenApiDocument } from "../index.js";

describe("http-openapi generator", () => {
  it("generates a deterministic OpenAPI document from router metadata", () => {
    const router = createRouter({
      routes: [
        {
          method: "POST",
          path: "/auth/session",
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              operationId: "createSession",
              summary: "Create session",
              tags: ["session", "auth"],
              requestBodySchema: {
                type: "object",
                required: ["email"],
                properties: {
                  password: { type: "string" },
                  email: { type: "string" }
                }
              },
              responseSchemas: {
                "201": {
                  type: "object",
                  properties: {
                    sessionId: { type: "string" },
                    userId: { type: "string" }
                  }
                }
              }
            }
          }
        },
        {
          method: "GET",
          path: "/users/:userId",
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              operationId: "getUser",
              tags: ["users", "auth"]
            }
          }
        }
      ]
    });

    const document = generateOpenApiDocument({
      title: "Auth API",
      version: "1.0.0",
      routers: [router]
    });

    expect(document).toEqual({
      openapi: "3.1.0",
      info: {
        title: "Auth API",
        version: "1.0.0"
      },
      paths: {
        "/auth/session": {
          post: {
            operationId: "createSession",
            summary: "Create session",
            tags: ["auth", "session"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    properties: {
                      email: { type: "string" },
                      password: { type: "string" }
                    },
                    required: ["email"],
                    type: "object"
                  }
                }
              }
            },
            responses: {
              "201": {
                description: "HTTP 201 response",
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        sessionId: { type: "string" },
                        userId: { type: "string" }
                      },
                      type: "object"
                    }
                  }
                }
              }
            }
          }
        },
        "/users/{userId}": {
          get: {
            operationId: "getUser",
            tags: ["auth", "users"],
            parameters: [
              {
                in: "path",
                name: "userId",
                required: true,
                schema: {
                  type: "string"
                }
              }
            ],
            responses: {
              "200": {
                description: "Success"
              }
            }
          }
        }
      }
    });
  });

  it("skips routes excluded from OpenAPI generation", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/health",
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              include: false,
              operationId: "healthCheck"
            }
          }
        }
      ]
    });

    const document = generateOpenApiDocument({
      title: "Health API",
      version: "1.0.0",
      routers: [router]
    });

    expect(document).toEqual({
      openapi: "3.1.0",
      info: {
        title: "Health API",
        version: "1.0.0"
      },
      paths: {}
    });
  });

  it("fails clearly when included route metadata lacks operationId", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/auth/session",
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              include: true,
              summary: "Read session"
            }
          }
        }
      ]
    });

    expect(() =>
      generateOpenApiDocument({
        title: "Broken API",
        version: "1.0.0",
        routers: [router]
      })
    ).toThrowError(
      expect.objectContaining<Partial<OpenApiGenerationError>>({
        code: "OPENAPI_META_INCOMPLETE",
        details: {
          method: "GET",
          path: "/auth/session"
        }
      })
    );
  });

  it("emits every path parameter required by templated routes", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/teams/:teamId/users/:userId",
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              operationId: "getTeamUser",
            }
          }
        }
      ]
    });

    const document = generateOpenApiDocument({
      title: "Nested API",
      version: "1.0.0",
      routers: [router]
    });

    expect(document).toMatchObject({
      paths: {
        "/teams/{teamId}/users/{userId}": {
          get: {
            parameters: [
              {
                in: "path",
                name: "teamId",
                required: true,
                schema: { type: "string" }
              },
              {
                in: "path",
                name: "userId",
                required: true,
                schema: { type: "string" }
              }
            ]
          }
        }
      }
    });
  });

  it("fails clearly when two routes normalize to the same method and path", () => {
    const router = createRouter({
      routes: [
        {
          method: "GET",
          path: "/users/:userId",
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              operationId: "getUserById",
            }
          }
        },
        {
          method: "GET",
          path: "/users/{userId}".replace("{userId}", ":userId"),
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              operationId: "getUserDuplicate",
            }
          }
        }
      ]
    });

    expect(() =>
      generateOpenApiDocument({
        title: "Duplicate API",
        version: "1.0.0",
        routers: [router]
      })
    ).toThrowError(
      expect.objectContaining<Partial<OpenApiGenerationError>>({
        code: "OPENAPI_META_INCOMPLETE",
        details: {
          method: "GET",
          path: "/users/{userId}"
        }
      })
    );
  });

  it("fails clearly when a response schema entry is not an object", () => {
    const router = createRouter({
      routes: [
        {
          method: "POST",
          path: "/broken",
          handler: () => Response.json({ ok: true }),
          meta: {
            openapi: {
              operationId: "brokenResponseSchema",
              responseSchemas: {
                "200": null as never,
              }
            }
          }
        }
      ]
    });

    expect(() =>
      generateOpenApiDocument({
        title: "Broken API",
        version: "1.0.0",
        routers: [router]
      })
    ).toThrowError(
      expect.objectContaining<Partial<OpenApiGenerationError>>({
        code: "OPENAPI_META_INCOMPLETE",
        details: {
          method: "POST",
          path: "/broken"
        }
      })
    );
  });
});
