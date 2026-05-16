/**
 * Integration tests for the mock server.
 *
 * Covers: TV-MOCK-001 through TV-MOCK-007.
 * Starts a real HTTP server on a random port for each test.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { OpenAPIDocument } from "@apifn/core";
import { createMockServer } from "../src/server.js";
import { generateFromSchema, generateRandom, generateResponse } from "../src/response-generator.js";
import { validateRequestBody, validateParameters } from "../src/request-validator.js";
import type { SchemaObject, OperationObject } from "@apifn/core";

// ─── Test spec ───────────────────────────────────────────────────────────────

const TEST_SPEC: OpenAPIDocument = {
    openapi: "3.1.0",
    info: { title: "Mock Test API", version: "1.0.0" },
    paths: {
        "/users": {
            get: {
                summary: "List users",
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        name: { type: "string" },
                                        age: { type: "integer" },
                                        active: { type: "boolean" },
                                        tags: { type: "array", items: { type: "string" } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: "Create user",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["name"],
                                properties: {
                                    name: { type: "string" },
                                    age: { type: "integer", minimum: 0 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "201": {
                        description: "Created",
                        content: {
                            "application/json": {
                                example: { id: "abc-123", name: "Alice" },
                            },
                        },
                    },
                },
            },
        },
        "/users/{id}": {
            get: {
                summary: "Get user",
                parameters: [{ name: "id", in: "path", required: true }],
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { id: { type: "string" }, name: { type: "string" } },
                                },
                            },
                        },
                    },
                },
            },
        },
        "/health": {
            get: {
                summary: "Health check",
                responses: { "204": { description: "No Content" } },
            },
        },
    },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function get(port: number, path: string): Promise<Response> {
    return fetch(`http://localhost:${port}${path}`);
}

async function post(port: number, path: string, body: unknown): Promise<Response> {
    return fetch(`http://localhost:${port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

// ─── TV-MOCK-001: All paths served ───────────────────────────────────────────

describe("TV-MOCK-001: all paths served", () => {
    let mock = createMockServer({ spec: TEST_SPEC, port: 0 });

    beforeAll(() => mock.start());
    afterAll(() => mock.stop());

    it("GET /users returns 200", async () => {
        const res = await get(mock.port, "/users");
        expect(res.status).toBe(200);
    });

    it("GET /users/123 (path param) returns 200", async () => {
        const res = await get(mock.port, "/users/123");
        expect(res.status).toBe(200);
    });

    it("GET /health returns 204", async () => {
        const res = await get(mock.port, "/health");
        expect(res.status).toBe(204);
    });

    it("undefined path returns 404", async () => {
        const res = await get(mock.port, "/nonexistent");
        expect(res.status).toBe(404);
    });
});

// ─── TV-MOCK-002: Schema mode ─────────────────────────────────────────────────

describe("TV-MOCK-002: schema mode (deterministic defaults)", () => {
    it("string schema → 'string'", () => {
        const result = generateFromSchema({ type: "string" } as SchemaObject);
        expect(result).toBe("string");
    });

    it("integer schema → 0", () => {
        expect(generateFromSchema({ type: "integer" } as SchemaObject)).toBe(0);
    });

    it("number schema → 0", () => {
        expect(generateFromSchema({ type: "number" } as SchemaObject)).toBe(0);
    });

    it("boolean schema → true", () => {
        expect(generateFromSchema({ type: "boolean" } as SchemaObject)).toBe(true);
    });

    it("null schema → null", () => {
        expect(generateFromSchema({ type: "null" } as SchemaObject)).toBe(null);
    });

    it("array schema → [item]", () => {
        const result = generateFromSchema({ type: "array", items: { type: "string" } } as SchemaObject);
        expect(Array.isArray(result)).toBe(true);
        expect((result as unknown[])[0]).toBe("string");
    });

    it("object schema → object with all properties", () => {
        const result = generateFromSchema({
            type: "object",
            properties: { id: { type: "string" }, count: { type: "integer" } },
        } as SchemaObject) as Record<string, unknown>;
        expect(result.id).toBe("string");
        expect(result.count).toBe(0);
    });

    it("is deterministic (same schema → same output)", () => {
        const schema: SchemaObject = {
            type: "object",
            properties: { name: { type: "string" }, active: { type: "boolean" } },
        } as SchemaObject;
        const r1 = generateFromSchema(schema);
        const r2 = generateFromSchema(schema);
        expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    });

    it("HTTP response via schema mode returns structured object", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, responseMode: "schema", port: 0 });
        await mock.start();
        const res = await get(mock.port, "/users");
        const data = await res.json() as Record<string, unknown>;
        await mock.stop();
        expect(data.id).toBe("string");
        expect(data.active).toBe(true);
    });
});

// ─── TV-MOCK-003: Examples mode ───────────────────────────────────────────────

describe("TV-MOCK-003: examples mode", () => {
    it("returns spec example when available", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, responseMode: "examples", port: 0 });
        await mock.start();
        const res = await post(mock.port, "/users", { name: "Alice" });
        const data = await res.json() as Record<string, unknown>;
        await mock.stop();
        expect(data.name).toBe("Alice");
        expect(data.id).toBe("abc-123");
    });

    it("falls back to schema when no example", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, responseMode: "examples", port: 0 });
        await mock.start();
        const res = await get(mock.port, "/users/42");
        const data = await res.json() as Record<string, unknown>;
        await mock.stop();
        // Falls back to schema generation
        expect(typeof data.id).toBe("string");
    });

    it("generateResponse returns example body for examples mode", () => {
        const op: OperationObject = {
            responses: {
                "200": {
                    description: "OK",
                    content: { "application/json": { example: { hello: "world" } } },
                },
            },
        };
        const { body } = generateResponse(op, "examples");
        expect((body as Record<string, unknown>).hello).toBe("world");
    });
});

// ─── TV-MOCK-004: Random mode ─────────────────────────────────────────────────

describe("TV-MOCK-004: random mode", () => {
    it("generateRandom returns different values on subsequent calls", () => {
        const schema: SchemaObject = { type: "string" } as SchemaObject;
        // Run many times; with sufficiently long random strings, at least some differ
        const values = new Set<string>();
        for (let i = 0; i < 50; i++) {
            values.add(String(generateRandom(schema)));
        }
        expect(values.size).toBeGreaterThan(1);
    });

    it("random integer is a number", () => {
        const result = generateRandom({ type: "integer" } as SchemaObject);
        expect(typeof result).toBe("number");
    });

    it("random object has all properties", () => {
        const schema: SchemaObject = {
            type: "object",
            properties: { x: { type: "string" }, y: { type: "number" } },
        } as SchemaObject;
        const result = generateRandom(schema) as Record<string, unknown>;
        expect("x" in result).toBe(true);
        expect("y" in result).toBe(true);
    });

    it("HTTP response via random mode responds 200", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, responseMode: "random", port: 0 });
        await mock.start();
        const res = await get(mock.port, "/users");
        await mock.stop();
        expect(res.status).toBe(200);
    });
});

// ─── TV-MOCK-005: Request validation ─────────────────────────────────────────

describe("TV-MOCK-005: request validation", () => {
    let mock = createMockServer({ spec: TEST_SPEC, validateRequests: true, port: 0 });

    beforeAll(() => mock.start());
    afterAll(() => mock.stop());

    it("valid body proceeds normally → 201", async () => {
        const res = await post(mock.port, "/users", { name: "Bob" });
        expect(res.status).toBe(201);
    });

    it("missing required field → 400", async () => {
        const res = await post(mock.port, "/users", { age: 25 }); // name is required
        expect(res.status).toBe(400);
        const data = await res.json() as { error: string };
        expect(data.error).toContain("Validation");
    });

    it("invalid body JSON → 400", async () => {
        const res = await fetch(`http://localhost:${mock.port}/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "not-json",
        });
        expect(res.status).toBe(400);
    });

    it("validateRequestBody unit: missing required field", () => {
        const op: OperationObject = {
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            required: ["name"],
                            properties: { name: { type: "string" } },
                        },
                    },
                },
            },
            responses: {},
        };
        const result = validateRequestBody({}, op);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]?.message).toContain("name");
    });

    it("validateRequestBody unit: valid body", () => {
        const op: OperationObject = {
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            required: ["name"],
                            properties: { name: { type: "string" } },
                        },
                    },
                },
            },
            responses: {},
        };
        const result = validateRequestBody({ name: "Alice" }, op);
        expect(result.valid).toBe(true);
    });

    it("validateParameters unit: missing required path param", () => {
        const op: OperationObject = {
            parameters: [{ name: "id", in: "path", required: true }],
            responses: {},
        };
        const result = validateParameters({}, {}, op);
        expect(result.valid).toBe(false);
    });

    it("rejects request bodies over the configured byte limit", async () => {
        const mock = createMockServer({
            spec: TEST_SPEC,
            validateRequests: true,
            maxRequestBodyBytes: 8,
            port: 0,
        });
        await mock.start();
        const res = await fetch(`http://localhost:${mock.port}/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Oversized" }),
        });
        await mock.stop();

        expect(res.status).toBe(400);
        const data = await res.json() as { error: string };
        expect(data.error).toContain("Request body exceeds");
    });
});

// ─── TV-MOCK-006: Configurable delay ─────────────────────────────────────────

describe("TV-MOCK-006: delay", () => {
    it("adds configured delay to response", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, delay: 50, port: 0 });
        await mock.start();
        const start = Date.now();
        await get(mock.port, "/users");
        const elapsed = Date.now() - start;
        await mock.stop();
        expect(elapsed).toBeGreaterThanOrEqual(45);
    });
});

// ─── TV-MOCK-007: CORS support ────────────────────────────────────────────────

describe("TV-MOCK-007: CORS", () => {
    it("cors: true adds permissive CORS headers", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, cors: true, port: 0 });
        await mock.start();
        const res = await get(mock.port, "/users");
        await mock.stop();
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("OPTIONS preflight returns 204", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, cors: true, port: 0 });
        await mock.start();
        const res = await fetch(`http://localhost:${mock.port}/users`, { method: "OPTIONS" });
        await mock.stop();
        expect(res.status).toBe(204);
    });

    it("no cors: false means no CORS headers", async () => {
        const mock = createMockServer({ spec: TEST_SPEC, cors: false, port: 0 });
        await mock.start();
        const res = await get(mock.port, "/users");
        await mock.stop();
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });
});
