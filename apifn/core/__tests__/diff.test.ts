/**
 * Tests for diffOpenAPI() — Phase 13 deliverable.
 *
 * Covers TV-DIFF-001 through TV-DIFF-009.
 */

import { describe, it, expect } from "vitest";
import type { OpenAPIDocument } from "../src/types.js";
import { diffOpenAPI } from "../src/diff/diff.js";
import { formatDiffAsJson, formatDiffAsText } from "../src/diff/format.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blankDoc(title = "Test API"): OpenAPIDocument {
    return {
        openapi: "3.1.0",
        info: { title, version: "1.0.0" },
        paths: {},
    };
}

function withPaths(doc: OpenAPIDocument, paths: OpenAPIDocument["paths"]): OpenAPIDocument {
    return { ...doc, paths: { ...doc.paths, ...paths } };
}

// ─── TV-DIFF-001: Endpoint removal is breaking ────────────────────────────────

describe("TV-DIFF-001: endpoint removal", () => {
    it("detects removed endpoint as breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users/{id}": {
                delete: { responses: { "204": { description: "Deleted" } } },
                get: { responses: { "200": { description: "OK" } } },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users/{id}": {
                get: { responses: { "200": { description: "OK" } } },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.path.includes("delete"));
        expect(entry).toBeDefined();
        expect(entry?.type).toBe("removed");
        expect(entry?.breaking).toBe(true);
        expect(entry?.description).toContain("DELETE");
        expect(entry?.description).toContain("/users/{id}");
    });

    it("detects entire path removal as breaking for each method", () => {
        const before = withPaths(blankDoc(), {
            "/users": { get: { responses: { "200": { description: "OK" } } } },
        });
        const after = blankDoc();

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        expect(result.breaking.length).toBeGreaterThan(0);
        expect(result.breaking[0]?.description).toContain("removed");
    });
});

// ─── TV-DIFF-002: Required param addition is breaking ────────────────────────

describe("TV-DIFF-002: required parameter addition", () => {
    it("required param added → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "filter", in: "query", required: true, schema: { type: "string" } }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.path.includes("filter"));
        expect(entry).toBeDefined();
        expect(entry?.breaking).toBe(true);
        expect(entry?.description).toContain("Required");
    });

    it("optional param added → non-breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "sort", in: "query", required: false, schema: { type: "string" } }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(false);
        const entry = result.nonBreaking.find((e) => e.path.includes("sort"));
        expect(entry).toBeDefined();
        expect(entry?.breaking).toBe(false);
    });

    it("param changed from optional to required → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "limit", in: "query", required: true, schema: { type: "integer" } }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.description.includes("required"));
        expect(entry).toBeDefined();
    });

    it("unresolved parameter $ref is reported as breaking instead of being dropped", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ $ref: "#/components/parameters/Limit" } as never],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        const entry = result.breaking.find((e) => e.description.includes("#/components/parameters/Limit"));
        expect(entry).toBeDefined();
        expect(entry?.breaking).toBe(true);
    });
});

// ─── TV-DIFF-003: Type narrowing is breaking ─────────────────────────────────

describe("TV-DIFF-003: type narrowing", () => {
    it("parameter type narrowed (string|number → string) → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [
                        { name: "id", in: "query", schema: { type: ["string", "number"] } },
                    ],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "id", in: "query", schema: { type: "string" } }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.description.toLowerCase().includes("narrow"));
        expect(entry).toBeDefined();
    });

    it("existing optional request body field becoming required is breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                post: {
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                    responses: { "201": { description: "Created" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                post: {
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["name"],
                                    properties: {
                                        name: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                    responses: { "201": { description: "Created" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        const entry = result.breaking.find((e) => e.description.includes("became required"));
        expect(entry).toBeDefined();
        expect(entry?.path).toContain("requestBody");
    });

    it("existing request body becoming required is breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                post: {
                    requestBody: {
                        required: false,
                        content: {
                            "application/json": {
                                schema: { type: "object" },
                            },
                        },
                    },
                    responses: { "201": { description: "Created" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                post: {
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: { type: "object" },
                            },
                        },
                    },
                    responses: { "201": { description: "Created" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        const entry = result.breaking.find((e) => e.path === "paths./users.post.requestBody.required");
        expect(entry).toBeDefined();
        expect(entry?.breaking).toBe(true);
    });
});

// ─── TV-DIFF-004: Response field removal is breaking ─────────────────────────

describe("TV-DIFF-004: response field removal", () => {
    it("response field removed → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
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
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    responses: {
                        "200": {
                            description: "OK",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: { id: { type: "string" } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.path.includes("name"));
        expect(entry).toBeDefined();
        expect(entry?.type).toBe("removed");
        expect(entry?.description).toContain("name");
    });

    it("response field added → non-breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    responses: {
                        "200": {
                            description: "OK",
                            content: {
                                "application/json": {
                                    schema: { type: "object", properties: { id: { type: "string" } } },
                                },
                            },
                        },
                    },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    responses: {
                        "200": {
                            description: "OK",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: { id: { type: "string" }, email: { type: "string" } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(false);
        const entry = result.nonBreaking.find((e) => e.path.includes("email"));
        expect(entry).toBeDefined();
        expect(entry?.breaking).toBe(false);
    });

    it("status code removed from responses → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    responses: {
                        "200": { description: "OK" },
                        "404": { description: "Not Found" },
                    },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: { responses: { "200": { description: "OK" } } },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.path.includes("404"));
        expect(entry).toBeDefined();
    });
});

// ─── TV-DIFF-005: Security requirement changes ────────────────────────────────

describe("TV-DIFF-005: security requirement changes", () => {
    it("security requirement added → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/admin": {
                get: {
                    security: [],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/admin": {
                get: {
                    security: [{ bearerAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.path.includes("security"));
        expect(entry).toBeDefined();
        expect(entry?.type).toBe("added");
    });

    it("security requirement removed → non-breaking", () => {
        const before = withPaths(blankDoc(), {
            "/admin": {
                get: {
                    security: [{ bearerAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/admin": {
                get: {
                    security: [],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(false);
        const entry = result.nonBreaking.find((e) => e.path.includes("security"));
        expect(entry).toBeDefined();
        expect(entry?.type).toBe("removed");
    });

    it("security alternative removed while auth remains → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/admin": {
                get: {
                    security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/admin": {
                get: {
                    security: [{ bearerAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.path.includes("security"));
        expect(entry).toBeDefined();
        expect(entry?.type).toBe("removed");
    });
});

// ─── TV-DIFF-006: Non-breaking additions ─────────────────────────────────────

describe("TV-DIFF-006: non-breaking additions", () => {
    it("new endpoint added → non-breaking", () => {
        const before = blankDoc();
        const after = withPaths(blankDoc(), {
            "/orders": {
                get: { responses: { "200": { description: "OK" } } },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(false);
        expect(result.nonBreaking.length).toBe(1);
        expect(result.nonBreaking[0]?.type).toBe("added");
        expect(result.nonBreaking[0]?.description).toContain("GET /orders");
    });

    it("description change → non-breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    description: "Get all users",
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    description: "Get all users (updated)",
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(false);
        const entry = result.nonBreaking.find((e) => e.path.includes("description"));
        expect(entry).toBeDefined();
        expect(entry?.breaking).toBe(false);
    });

    it("deprecated flag added → non-breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: { deprecated: false, responses: { "200": { description: "OK" } } },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: { deprecated: true, responses: { "200": { description: "OK" } } },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(false);
        const entry = result.nonBreaking.find((e) => e.path.includes("deprecated"));
        expect(entry).toBeDefined();
    });
});

// ─── TV-DIFF-007: Summary generation ─────────────────────────────────────────

describe("TV-DIFF-007: summary generation", () => {
    it("summary counts are accurate", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: { responses: { "200": { description: "OK" } } },
                delete: { responses: { "204": { description: "Deleted" } } },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    description: "Updated", // non-breaking modification
                    responses: {
                        "200": { description: "OK" },
                        "400": { description: "Bad Request" }, // added response status (non-breaking)
                    },
                },
                // delete removed → breaking
            },
            "/orders": {
                get: { responses: { "200": { description: "OK" } } }, // added endpoint (non-breaking)
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.summary.breaking).toBe(result.breaking.length);
        expect(result.summary.nonBreaking).toBe(result.nonBreaking.length);
        expect(result.summary.added).toBeGreaterThan(0); // /orders + response 400
        expect(result.summary.removed).toBeGreaterThan(0); // delete removed
        expect(typeof result.summary.modified).toBe("number");
    });
});

// ─── TV-DIFF-008: Deterministic results ─────────────────────────────────────

describe("TV-DIFF-008: deterministic results", () => {
    it("same inputs produce structurally equal output", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "limit", in: "query" }],
                    responses: { "200": { description: "OK" } },
                },
            },
            "/orders": { get: { responses: { "200": { description: "OK" } } } },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "limit", in: "query" }, { name: "filter", in: "query", required: true }],
                    responses: { "200": { description: "OK" } },
                },
            },
            // /orders removed
        });

        const result1 = diffOpenAPI(before, after);
        const result2 = diffOpenAPI(before, after);

        expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
        // Entries should be sorted by path
        const paths1 = result1.breaking.map((e) => e.path);
        const paths2 = result2.breaking.map((e) => e.path);
        expect(paths1).toEqual([...paths1].sort());
        expect(paths1).toEqual(paths2);
    });
});

// ─── TV-DIFF-009: JSON and human-readable output ─────────────────────────────

describe("TV-DIFF-009: formatters", () => {
    it("formatDiffAsJson produces SPEC 6.5 format", () => {
        const before = withPaths(blankDoc(), {
            "/users": { delete: { responses: { "204": { description: "Deleted" } } } },
        });
        const after = blankDoc();

        const result = diffOpenAPI(before, after);
        const json = formatDiffAsJson(result, "2026-03-05T22:00:00Z");

        expect(json.timestamp).toBe("2026-03-05T22:00:00Z");
        expect(json.hasBreakingChanges).toBe(true);
        expect(json.summary).toBeDefined();
        expect(json.breaking).toBeInstanceOf(Array);
        expect(json.nonBreaking).toBeInstanceOf(Array);
        // Should be JSON-serializable
        expect(() => JSON.stringify(json)).not.toThrow();
    });

    it("formatDiffAsText produces human-readable output with key sections", () => {
        const before = withPaths(blankDoc(), {
            "/users": { delete: { responses: { "204": { description: "Deleted" } } } },
        });
        const after = blankDoc();

        const result = diffOpenAPI(before, after);
        const text = formatDiffAsText(result);

        expect(text).toContain("API Diff Report");
        expect(text).toContain("Breaking Changes");
        expect(text).toContain("breaking change");
    });

    it("formatDiffAsText shows 'No changes' when diff is empty", () => {
        const doc = withPaths(blankDoc(), {
            "/health": { get: { responses: { "200": { description: "OK" } } } },
        });
        const result = diffOpenAPI(doc, doc);
        const text = formatDiffAsText(result);
        expect(text).toContain("No changes detected");
        expect(text).toContain("No breaking changes");
    });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("Edge cases", () => {
    it("identical docs → no changes", () => {
        const doc = withPaths(blankDoc(), {
            "/users": { get: { responses: { "200": { description: "OK" } } } },
        });
        const result = diffOpenAPI(doc, doc);
        expect(result.hasBreakingChanges).toBe(false);
        expect(result.breaking.length).toBe(0);
        expect(result.nonBreaking.length).toBe(0);
    });

    it("empty → empty → no changes", () => {
        const result = diffOpenAPI(blankDoc(), blankDoc());
        expect(result.breaking.length).toBe(0);
        expect(result.nonBreaking.length).toBe(0);
    });

    it("parameter removed → breaking", () => {
        const before = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [{ name: "limit", in: "query", required: false }],
                    responses: { "200": { description: "OK" } },
                },
            },
        });
        const after = withPaths(blankDoc(), {
            "/users": {
                get: {
                    parameters: [],
                    responses: { "200": { description: "OK" } },
                },
            },
        });

        const result = diffOpenAPI(before, after);
        expect(result.hasBreakingChanges).toBe(true);
        const entry = result.breaking.find((e) => e.path.includes("limit"));
        expect(entry).toBeDefined();
        expect(entry?.type).toBe("removed");
    });
});
