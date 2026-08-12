/**
 * Tests for @apifn/snippets — TV-SNIP-001 through TV-SNIP-007
 */

import { describe, it, expect } from "vitest";
import type { OperationObject, SnippetOptions, OpenAPIDocument } from "@apifn/core";
import { generateSnippet, generateAllSnippets, SUPPORTED_TARGETS } from "../src/generator.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_OPTS: Omit<SnippetOptions, "target"> = {
    baseUrl: "https://api.example.com",
    indent: 2,
};

const GET_OP: OperationObject = {
    summary: "List users",
    responses: { "200": { description: "OK" } },
};

const POST_OP: OperationObject = {
    summary: "Create user",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        name: { type: "string", example: "Alice" },
                        email: { type: "string", example: "alice@example.com" },
                    },
                },
            },
        },
    },
    responses: { "201": { description: "Created" } },
};

const AUTH_BEARER: SnippetOptions["auth"] = { type: "bearer", token: "my-secret-token" };
const AUTH_APIKEY: SnippetOptions["auth"] = { type: "apikey", key: "MY_KEY", keyName: "X-API-Key", keyIn: "header" } as SnippetOptions["auth"];
const AUTH_BASIC: SnippetOptions["auth"] = { type: "basic" } as SnippetOptions["auth"] & { username?: string; password?: string };

const SPEC: OpenAPIDocument = {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
        "/users": {
            get: GET_OP,
            post: POST_OP,
        },
        "/users/{id}": {
            get: {
                summary: "Get user",
                parameters: [{ name: "id", in: "path", example: "123" }],
                responses: { "200": { description: "OK" } },
            },
        },
    },
};

// ─── TV-SNIP-001: curl ────────────────────────────────────────────────────────

describe("TV-SNIP-001: curl target", () => {
    it("generates a valid curl GET command with method and URL", () => {
        const code = generateSnippet(GET_OP, "/users", "get", { ...BASE_OPTS, target: "curl" });
        expect(code).toContain("curl -X GET");
        expect(code).toContain("https://api.example.com/users");
    });

    it("generates curl POST with body", () => {
        const code = generateSnippet(POST_OP, "/users", "post", { ...BASE_OPTS, target: "curl" });
        expect(code).toContain("-X POST");
        expect(code).toContain("-d");
        expect(code).toContain("Content-Type: application/json");
    });

    it("curl does not throw for DELETE", () => {
        const op: OperationObject = { responses: { "204": { description: "No Content" } } };
        expect(() => generateSnippet(op, "/users/1", "delete", { ...BASE_OPTS, target: "curl" })).not.toThrow();
    });
});

// ─── TV-SNIP-002: fetch ───────────────────────────────────────────────────────

describe("TV-SNIP-002: fetch target", () => {
    it("generates valid JavaScript fetch with async/await", () => {
        const code = generateSnippet(GET_OP, "/users", "get", { ...BASE_OPTS, target: "fetch" });
        expect(code).toContain("await fetch(");
        expect(code).toContain("'GET'");
        expect(code).toContain("https://api.example.com/users");
        expect(code).toContain("await response.json()");
    });

    it("fetch POST includes JSON.stringify body", () => {
        const code = generateSnippet(POST_OP, "/users", "post", { ...BASE_OPTS, target: "fetch" });
        expect(code).toContain("JSON.stringify(");
        expect(code).toContain("Content-Type");
        expect(code).toContain("application/json");
    });
});

// ─── TV-SNIP-003: axios ───────────────────────────────────────────────────────

describe("TV-SNIP-003: axios target", () => {
    it("generates axios GET", () => {
        const code = generateSnippet(GET_OP, "/users", "get", { ...BASE_OPTS, target: "axios" });
        expect(code).toContain("axios");
        expect(code).toContain(".get(");
        expect(code).toContain("https://api.example.com/users");
    });

    it("generates axios POST with body arg", () => {
        const code = generateSnippet(POST_OP, "/users", "post", { ...BASE_OPTS, target: "axios" });
        expect(code).toContain(".post(");
        expect(code).toContain("import axios");
    });
});

// ─── TV-SNIP-004: python-requests ────────────────────────────────────────────

describe("TV-SNIP-004: python-requests target", () => {
    it("generates valid Python with requests library", () => {
        const code = generateSnippet(GET_OP, "/users", "get", { ...BASE_OPTS, target: "python-requests" });
        expect(code).toContain("import requests");
        expect(code).toContain("requests.get(");
        expect(code).toContain("https://api.example.com/users");
        expect(code).toContain("response.json()");
    });

    it("POST includes json= kwarg", () => {
        const code = generateSnippet(POST_OP, "/users", "post", { ...BASE_OPTS, target: "python-requests" });
        expect(code).toContain("requests.post(");
        expect(code).toContain("json=");
    });
});

// ─── TV-SNIP-005: additional targets ─────────────────────────────────────────

describe("TV-SNIP-005: additional targets", () => {
    const targets: Array<SnippetOptions["target"]> = [
        "python-httpx",
        "node-fetch",
        "go-http",
        "ruby-net-http",
        "php-curl",
        "csharp-httpclient",
        "java-okhttp",
    ];

    for (const target of targets) {
        it(`${target} generates non-empty code`, () => {
            const code = generateSnippet(GET_OP, "/users", "get", { ...BASE_OPTS, target });
            expect(code.length).toBeGreaterThan(10);
            expect(code).toContain("https://api.example.com/users");
        });

        it(`${target} POST also generates valid code`, () => {
            const code = generateSnippet(POST_OP, "/users", "post", { ...BASE_OPTS, target });
            expect(code.length).toBeGreaterThan(10);
        });
    }

    it("supported targets count is 11", () => {
        expect(SUPPORTED_TARGETS.length).toBe(11);
    });

    it("escapes generated string literals for C#, Java, and PHP targets", () => {
        const csharp = generateSnippet(GET_OP, "/users", "get", {
            ...BASE_OPTS,
            target: "csharp-httpclient",
            baseUrl: "https://api.example.com/\"quoted\"/line\nbreak",
        });
        const java = generateSnippet(POST_OP, "/users", "post", {
            ...BASE_OPTS,
            target: "java-okhttp",
            baseUrl: "https://api.example.com/\"quoted\"",
        });
        const php = generateSnippet(GET_OP, "/users", "get", {
            ...BASE_OPTS,
            target: "php-curl",
            baseUrl: "https://api.example.com/o'hara",
        });

        expect(csharp).toContain("https://api.example.com/\\\"quoted\\\"/line\\nbreak/users");
        expect(java).toContain("https://api.example.com/\\\"quoted\\\"/users");
        expect(java).toContain("\\\"name\\\"");
        expect(php).toContain("https://api.example.com/o\\'hara/users");
    });

    it("unsupported target throws", () => {
        expect(() =>
            generateSnippet(GET_OP, "/users", "get", { ...BASE_OPTS, target: "unknown-target" as SnippetOptions["target"] })
        ).toThrow("Unsupported snippet target");
    });
});

// ─── TV-SNIP-006: auth injection ─────────────────────────────────────────────

describe("TV-SNIP-006: auth injection", () => {
    it("Bearer token → Authorization: Bearer header in curl", () => {
        const code = generateSnippet(GET_OP, "/users", "get", {
            ...BASE_OPTS,
            target: "curl",
            auth: AUTH_BEARER,
        });
        expect(code).toContain("Authorization: Bearer my-secret-token");
    });

    it("Bearer token → Authorization header in fetch", () => {
        const code = generateSnippet(GET_OP, "/users", "get", {
            ...BASE_OPTS,
            target: "fetch",
            auth: AUTH_BEARER,
        });
        expect(code).toContain("Authorization");
        expect(code).toContain("Bearer my-secret-token");
    });

    it("API Key → X-API-Key header in curl", () => {
        const code = generateSnippet(GET_OP, "/users", "get", {
            ...BASE_OPTS,
            target: "curl",
            auth: AUTH_APIKEY,
        });
        expect(code).toContain("X-API-Key: MY_KEY");
    });

    it("Basic auth → Authorization: Basic header in python-requests", () => {
        const code = generateSnippet(GET_OP, "/users", "get", {
            ...BASE_OPTS,
            target: "python-requests",
            auth: AUTH_BASIC,
        });
        expect(code).toContain("Authorization");
        expect(code).toContain("Basic");
    });

    it("No auth → no Authorization header", () => {
        const code = generateSnippet(GET_OP, "/users", "get", { ...BASE_OPTS, target: "curl" });
        expect(code).not.toContain("Authorization");
    });
});

// ─── TV-SNIP-007: variable substitution ──────────────────────────────────────

describe("TV-SNIP-007: variable substitution", () => {
    it("baseUrl is substituted into the URL", () => {
        const code = generateSnippet(GET_OP, "/users", "get", {
            ...BASE_OPTS,
            baseUrl: "https://staging.example.com",
            target: "curl",
        });
        expect(code).toContain("https://staging.example.com/users");
        expect(code).not.toContain("api.example.com");
    });

    it("path parameters are substituted from operation examples", () => {
        const op: OperationObject = {
            parameters: [{ name: "id", in: "path", example: "42" }],
            responses: { "200": { description: "OK" } },
        };
        const code = generateSnippet(op, "/users/{id}", "get", { ...BASE_OPTS, target: "curl" });
        expect(code).toContain("/users/42");
        expect(code).not.toContain("{id}");
    });

    it("path parameters without example retain placeholder", () => {
        const op: OperationObject = {
            parameters: [{ name: "id", in: "path" }],
            responses: { "200": { description: "OK" } },
        };
        const code = generateSnippet(op, "/users/{id}", "get", { ...BASE_OPTS, target: "curl" });
        expect(code).toContain("/users/{id}");
    });
});

// ─── generateAllSnippets ──────────────────────────────────────────────────────

describe("generateAllSnippets", () => {
    it("generates one snippet per operation in the spec", () => {
        const result = generateAllSnippets(SPEC, { ...BASE_OPTS, target: "curl" });
        // /users GET + /users POST + /users/{id} GET = 3 operations
        expect(result.snippets.length).toBe(3);
        expect(result.snippets.every((s) => s.target === "curl")).toBe(true);
    });

    it("each snippet has path, method, code", () => {
        const result = generateAllSnippets(SPEC, { ...BASE_OPTS, target: "fetch" });
        for (const snippet of result.snippets) {
            expect(snippet.path).toBeTruthy();
            expect(snippet.method).toBeTruthy();
            expect(snippet.code.length).toBeGreaterThan(0);
        }
    });

    it("empty spec generates no snippets", () => {
        const emptySpec: OpenAPIDocument = {
            openapi: "3.1.0",
            info: { title: "Empty", version: "1.0.0" },
            paths: {},
        };
        const result = generateAllSnippets(emptySpec, { ...BASE_OPTS, target: "curl" });
        expect(result.snippets.length).toBe(0);
    });
});
