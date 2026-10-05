/**
 * Provider tests for @apifn/docsfn (TV-DOCS-001, TV-DOCS-004, TV-DOCS-006).
 */

import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { createApifnProvider } from "../src/provider.js";
import type { OpenAPIDocument } from "../src/types.js";

// Minimal OpenAPI spec fixture with two tags
const TAGGED_SPEC: OpenAPIDocument = {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
        "/users": {
            get: { tags: ["users"], summary: "List users", responses: { "200": { description: "ok" } } },
            post: { tags: ["users"], summary: "Create user", responses: { "201": { description: "created" } } },
        },
        "/users/{id}": {
            get: { tags: ["users"], summary: "Get user", parameters: [{ name: "id", in: "path", required: true }], responses: { "200": { description: "ok" } } },
            delete: { tags: ["users"], summary: "Delete user", responses: { "204": { description: "no content" } } },
        },
        "/orders": {
            get: { tags: ["orders"], summary: "List orders", responses: { "200": { description: "ok" } } },
            post: { tags: ["orders"], summary: "Create order", responses: { "201": { description: "created" } } },
        },
        "/health": {
            get: { tags: ["system"], summary: "Health check", responses: { "200": { description: "ok" } } },
        },
    },
} as unknown as OpenAPIDocument;

const UNTAGGED_SPEC: OpenAPIDocument = {
    openapi: "3.0.0",
    info: { title: "Untagged API", version: "2.0.0" },
    paths: {
        "/ping": {
            get: { summary: "Ping", responses: { "200": { description: "pong" } } },
        },
        "/status": {
            get: { summary: "Status", responses: { "200": { description: "ok" } } },
        },
    },
} as unknown as OpenAPIDocument;

// ─── TV-DOCS-001: splitByTag=true ────────────────────────────────────────────

describe("TV-DOCS-001: createApifnProvider — split by tag", () => {
    it("returns one entry per tag", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC, splitByTag: true });
        const entries = await provider();
        const tags = entries.map((e) => e.tag).sort();
        expect(tags).toEqual(["orders", "system", "users"]);
    });


    it("each entry slug is derived from the tag", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC, splitByTag: true, basePath: "/api" });
        const entries = await provider();
        const slugs = entries.map((e) => e.slug).sort();
        expect(slugs).toEqual(["/api/orders", "/api/system", "/api/users"]);
    });

    it("users tag has 4 endpoints", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC, splitByTag: true });
        const entries = await provider();
        const users = entries.find((e) => e.tag === "users")!;
        expect(users.endpoints).toHaveLength(4);
    });

    it("endpoints have correct method and path", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC, splitByTag: true });
        const entries = await provider();
        const users = entries.find((e) => e.tag === "users")!;
        const methods = users.endpoints.map((e) => e.method).sort();
        expect(methods).toContain("get");
        expect(methods).toContain("post");
        expect(methods).toContain("delete");
    });

    it("merges path-level parameters into endpoint operations", async () => {
        const provider = createApifnProvider({
            spec: {
                openapi: "3.0.0",
                info: { title: "Path Params API", version: "1.0.0" },
                paths: {
                    "/users/{id}": {
                        parameters: [{ name: "id", in: "path", required: true }],
                        get: {
                            tags: ["users"],
                            summary: "Get user",
                            parameters: [{ name: "verbose", in: "query" }],
                            responses: { "200": { description: "ok" } },
                        },
                    },
                },
            } as unknown as OpenAPIDocument,
            splitByTag: false,
        });

        const entries = await provider();
        const parameters = entries[0].endpoints[0].operation.parameters ?? [];
        expect(parameters).toEqual([
            { name: "id", in: "path", required: true },
            { name: "verbose", in: "query" },
        ]);
    });

    it("operation-level parameters override matching path-level parameters", async () => {
        const provider = createApifnProvider({
            spec: {
                openapi: "3.0.0",
                info: { title: "Path Params API", version: "1.0.0" },
                paths: {
                    "/users/{id}": {
                        parameters: [{ name: "id", in: "path", required: true, description: "path" }],
                        get: {
                            tags: ["users"],
                            summary: "Get user",
                            parameters: [{ name: "id", in: "path", required: true, description: "operation" }],
                            responses: { "200": { description: "ok" } },
                        },
                    },
                },
            } as unknown as OpenAPIDocument,
            splitByTag: false,
        });

        const entries = await provider();
        expect(entries[0].endpoints[0].operation.parameters).toEqual([
            { name: "id", in: "path", required: true, description: "operation" },
        ]);
    });

    it("deduplicates matching path-level and operation-level parameter references", async () => {
        const provider = createApifnProvider({
            spec: {
                openapi: "3.0.0",
                info: { title: "Path Params API", version: "1.0.0" },
                paths: {
                    "/users/{id}": {
                        parameters: [{ $ref: "#/components/parameters/UserId" }],
                        get: {
                            tags: ["users"],
                            summary: "Get user",
                            parameters: [
                                { $ref: "#/components/parameters/UserId" },
                                { name: "verbose", in: "query" },
                            ],
                            responses: { "200": { description: "ok" } },
                        },
                    },
                },
            } as unknown as OpenAPIDocument,
            splitByTag: false,
        });

        const entries = await provider();
        expect(entries[0].endpoints[0].operation.parameters).toEqual([
            { $ref: "#/components/parameters/UserId" },
            { name: "verbose", in: "query" },
        ]);
    });

    it("results are cached (same array reference on second call)", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC });
        const first = await provider();
        const second = await provider();
        expect(first).toBe(second);
    });

});

// ─── TV-DOCS-001: splitByTag=false ───────────────────────────────────────────

describe("TV-DOCS-001: createApifnProvider — full spec (splitByTag: false)", () => {
    it("returns a single entry", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC, splitByTag: false });
        const entries = await provider();
        expect(entries).toHaveLength(1);
    });

    it("single entry has all endpoints", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC, splitByTag: false });
        const entries = await provider();
        expect(entries[0].endpoints.length).toBe(7);
    });

});

// ─── TV-DOCS-004: sidebar generation ─────────────────────────────────────────

describe("TV-DOCS-004: sidebar generation", () => {
    it("each entry has a sidebar group with links", async () => {
        const provider = createApifnProvider({ spec: TAGGED_SPEC, splitByTag: true });
        const entries = await provider();
        for (const entry of entries) {
            expect(entry.sidebar.type).toBe("group");
            expect(entry.sidebar.items.length).toBeGreaterThan(0);
            for (const item of entry.sidebar.items) {
                expect(item.type).toBe("link");
                if (item.type === "link") {
                    expect(item.label).toBeTruthy();
                    expect(item.href).toContain(entry.slug);
                }
            }
        }
    });

});

// ─── TV-DOCS-006: split by tag (multi-page slugs) ────────────────────────────

describe("TV-DOCS-006: split by tag produces correct slugs", () => {
    it("tag names are slugified (lowercase, hyphens)", async () => {
        const spec = {
            ...TAGGED_SPEC,
            paths: {
                "/foo": { get: { tags: ["My Tag Group"], responses: { "200": { description: "ok" } } } },
            },
        } as unknown as OpenAPIDocument;
        const provider = createApifnProvider({ spec, splitByTag: true, basePath: "/docs" });
        const entries = await provider();
        expect(entries[0].slug).toBe("/docs/my-tag-group");
    });

    it("endpoints without tags use 'default' tag", async () => {
        const provider = createApifnProvider({ spec: UNTAGGED_SPEC, splitByTag: true });
        const entries = await provider();
        expect(entries.some((e) => e.tag === "default")).toBe(true);
    });
});

// ─── File path loading ────────────────────────────────────────────────────────

describe("createApifnProvider — specPath loading", () => {
    it("loads and parses a YAML spec from file", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "apifn-docsfn-spec-"));
        try {
            const specPath = path.join(directory, "openapi.yml");
            await writeFile(specPath, `
openapi: 3.0.0
info:
  title: File-backed API
  version: 2.0.0
paths:
  /file-status:
    get:
      responses:
        '200':
          description: File status
`);
            const provider = createApifnProvider({ specPath, splitByTag: false });
            const entries = await provider();
            expect(entries).toHaveLength(1);
            expect(entries[0].spec.info).toEqual({ title: "File-backed API", version: "2.0.0" });
            expect(entries[0].endpoints.map(({ method, path }) => ({ method, path }))).toEqual([
                { method: "get", path: "/file-status" },
            ]);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("throws if neither spec nor specPath provided", async () => {
        const provider = createApifnProvider({});
        await expect(provider()).rejects.toThrow();
    });
});
