import { describe, it, expect } from "vitest";
import type {
  HttpMethod,
  IntrospectOptions,
  IntrospectedRoute,
  ParameterDescriptor,
  RequestBodyDescriptor,
  ResponseDescriptor,
  SecurityRequirement,
  SchemaDescriptor,
  SchemaDescriptorResponse,
  OpenAPIGenerateOptions,
  OpenAPIDocument,
  OpenAPIInfoObject,
  ServerObject,
  ExternalDocsObject,
  TagObject,
  PathsObject,
  PathItemObject,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  MediaTypeObject,
  SchemaObject,
  ComponentsObject,
  SecuritySchemeObject,
  HeaderObject,
  LinkObject,
  ExampleObject,
  ReferenceObject,
  EncodingObject,
  OAuthFlowsObject,
  OAuthFlowObject,
  DiffResult,
  DiffEntry,
  ValidationError,
  AuthConfig,
  EndpointMetrics,
  WatchFnClient,
  RateLimitInfo,
  SnippetTarget,
  SnippetOptions,
  MockServerOptions,
  CorsOptions,
  SchemaInput,
  JsonSchema,
  Router,
  Route,
  Middleware,
} from "../index.js";

describe("Core types", () => {
  it("exports all introspection types", () => {
    const options: IntrospectOptions = { include: ["/api"] };
    expect(options.include).toEqual(["/api"]);

    const param: ParameterDescriptor = {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string" },
    };
    expect(param.name).toBe("id");

    const route: IntrospectedRoute = {
      method: "GET",
      path: "/users",
      parameters: [param],
      responses: { "200": { description: "Success" } },
      meta: {},
    };
    expect(route.method).toBe("GET");
  });

  it("exports schema descriptor types", () => {
    const desc: SchemaDescriptor = {
      summary: "Create user",
      operationId: "createUser",
      tags: ["users"],
      responses: {
        201: { description: "Created" },
      },
    };
    expect(desc.operationId).toBe("createUser");
  });

  it("exports OpenAPI document types", () => {
    const doc: OpenAPIDocument = {
      openapi: "3.1.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {},
    };
    expect(doc.openapi).toBe("3.1.0");

    const opts: OpenAPIGenerateOptions = {
      info: { title: "Test", version: "1.0.0" },
    };
    expect(opts.info.title).toBe("Test");
  });

  it("exports diff types", () => {
    const entry: DiffEntry = {
      type: "removed",
      breaking: true,
      path: "paths./users.delete",
      description: "Endpoint removed",
    };
    expect(entry.breaking).toBe(true);

    const result: DiffResult = {
      breaking: [entry],
      nonBreaking: [],
      hasBreakingChanges: true,
      summary: {
        added: 0,
        removed: 1,
        modified: 0,
        breaking: 1,
        nonBreaking: 0,
      },
    };
    expect(result.hasBreakingChanges).toBe(true);
  });

  it("exports validation error type", () => {
    const err: ValidationError = {
      path: "info.title",
      message: "Required",
      severity: "error",
    };
    expect(err.severity).toBe("error");
  });

  it("exports integration types", () => {
    const metrics: EndpointMetrics = {
      method: "GET",
      path: "/users",
      latency: { p50: 10, p95: 50, p99: 100, avg: 20 },
      throughput: { rpm: 100, total: 5000 },
      errors: { rate: 0.01, count: 50 },
      availability: 0.99,
      lastUpdated: "2026-03-05T00:00:00Z",
    };
    expect(metrics.method).toBe("GET");

    const rateLimit: RateLimitInfo = {
      endpoint: "/users",
      method: "GET",
      remaining: 90,
      limit: 100,
      resetAt: Date.now() + 60000,
      blocked: false,
    };
    expect(rateLimit.blocked).toBe(false);
  });

  it("exports snippet types", () => {
    const target: SnippetTarget = "curl";
    expect(target).toBe("curl");

    const opts: SnippetOptions = {
      target: "fetch",
      baseUrl: "http://localhost:3000",
    };
    expect(opts.target).toBe("fetch");
  });

  it("exports auth config type", () => {
    const auth: AuthConfig = {
      type: "bearer",
      token: "test-token",
    };
    expect(auth.type).toBe("bearer");
  });

  it("exports mock server types", () => {
    const doc: OpenAPIDocument = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
    };
    const opts: MockServerOptions = {
      spec: doc,
      port: 4010,
      responseMode: "schema",
    };
    expect(opts.port).toBe(4010);
  });
});
