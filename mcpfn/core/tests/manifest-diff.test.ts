import { describe, expect, it } from "vitest";

import {
  McpFnRegistry,
  canonicalJson,
  createManifest,
  diffManifests,
  structuredResult,
  validateManifest,
} from "../src/index.js";

function registry(required: string[] = ["value"], description = "Store a value.") {
  return new McpFnRegistry().register({
    name: "store",
    description,
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
        label: { type: "string" },
      },
      required,
      additionalProperties: false,
    },
    handler: async () => structuredResult({ ok: true }),
  });
}

describe("McpFn manifests", () => {
  it("creates deterministic, self-validating manifests", () => {
    const first = createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
      { transports: ["stdio", "streamable-http", "stdio"] },
    );
    const second = createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
      { transports: ["streamable-http", "stdio"] },
    );
    expect(first).toEqual(second);
    expect(validateManifest(first)).toEqual(first);
  });

  it("uses the validator's code-unit order for generated inventories", () => {
    const manifest = createManifest(
      { name: "ordering", version: "1.0.0" },
      new McpFnRegistry()
        .register({
          name: "a_b",
          description: "Underscore.",
          inputSchema: { type: "object" },
          handler: async () => structuredResult({ ok: true }),
        })
        .register({
          name: "a-b",
          description: "Dash.",
          inputSchema: { type: "object" },
          handler: async () => structuredResult({ ok: true }),
        }),
    );
    expect(manifest.tools.map((tool) => tool.name)).toEqual(["a-b", "a_b"]);
    expect(validateManifest(manifest)).toEqual(manifest);
  });

  it("classifies required inputs as breaking and descriptions as behavioral", () => {
    const before = createManifest(
      { name: "example", version: "1.0.0" },
      registry(["value"]),
    );
    const after = createManifest(
      { name: "renamed", version: "1.1.0", instructions: "Use labeled values." },
      registry(["value", "label"], "Store a labeled value."),
    );
    const diff = diffManifests(before, after);
    expect(diff.compatible).toBe(false);
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "requiredness-broken", severity: "breaking" }),
        expect.objectContaining({ code: "tool-description-changed", severity: "behavioral" }),
        expect.objectContaining({ code: "server-name-changed", severity: "breaking" }),
        expect.objectContaining({ code: "server-instructions-changed", severity: "behavioral" }),
      ]),
    );
  });

  it("detects required names that have no property schema", () => {
    const before = createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "token",
        description: "Accept a token.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ ok: true }),
      }),
    );
    const after = structuredClone(before);
    after.tools[0]!.inputSchema.required = ["token"];

    expect(diffManifests(before, after).changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "requiredness-broken", severity: "breaking" }),
    ]));
  });

  it("applies input and output variance to enum and constraint changes", () => {
    const before = createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "choose",
        description: "Choose a value.",
        inputSchema: {
          type: "object",
          properties: { value: { type: "string", enum: ["a", "b"] } },
          required: ["value"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: { value: { type: "string", enum: ["a"], pattern: "^a$" } },
          required: ["value"],
          additionalProperties: false,
        },
        metadata: { revision: 1 },
        handler: async () => structuredResult({ value: "a" }),
      }),
    );
    const after = createManifest(
      { name: "example", version: "1.1.0" },
      new McpFnRegistry().register({
        name: "choose",
        description: "Choose a value.",
        inputSchema: {
          type: "object",
          properties: { value: { type: "string", enum: ["a"] } },
          required: ["value"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: { value: { type: "string", enum: ["a", "b"] } },
          required: ["value"],
          additionalProperties: false,
        },
        metadata: { revision: 2 },
        handler: async () => structuredResult({ value: "a" }),
      }),
    );

    expect(diffManifests(before, after).changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "enum-narrowed", severity: "breaking" }),
      expect.objectContaining({ code: "enum-widened", severity: "breaking" }),
      expect.objectContaining({ code: "constraint-relaxed", severity: "breaking" }),
      expect.objectContaining({ code: "tool-metadata-changed", severity: "behavioral" }),
    ]));
  });

  it("rejects malformed manifest contracts before comparing them", () => {
    const manifest = createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
    );
    expect(() => validateManifest({
      ...manifest,
      tools: [{ ...manifest.tools[0], name: "contains whitespace" }],
    })).toThrow(/requires a name/);
    const reversedTools = createManifest(
      { name: "example", version: "1.0.0" },
      registry().register({
        name: "another",
        description: "Another tool.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ ok: true }),
      }),
    );
    expect(() => validateManifest({
      ...reversedTools,
      tools: [...reversedTools.tools].reverse(),
    })).toThrow(/sorted and unique/);
    expect(() => validateManifest({
      ...manifest,
      tools: [{
        ...manifest.tools[0],
        inputSchema: { type: "object", properties: { value: { minimum: "invalid" } } },
      }],
    })).toThrow(/invalid JSON Schema/);
    expect(() => validateManifest({
      ...manifest,
      tools: [{ ...manifest.tools[0], outputSchema: null }],
    })).toThrow(/outputSchema must be an object/);
    expect(() => validateManifest({
      ...manifest,
      prompts: [{ name: "invalid", argumentsSchema: false }],
    })).toThrow(/argumentsSchema must be an object/);
  });

  it("treats required or closed-schema output additions as breaking", () => {
    const create = (
      required: string[],
      additionalProperties: boolean,
      includeAdded: boolean,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "output",
        description: "Return output.",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          properties: {
            value: { type: "string" },
            ...(includeAdded ? { added: { type: "string" } } : {}),
          },
          required,
          additionalProperties,
        },
        handler: async () => structuredResult({ value: "ok", added: "new" }),
      }),
    );
    for (const [before, after] of [
      [create(["value"], false, false), create(["value"], false, true)],
      [create(["value"], true, false), create(["value", "added"], true, true)],
    ]) {
      expect(diffManifests(before, after)).toMatchObject({
        compatible: false,
        changes: expect.arrayContaining([
          expect.objectContaining({ code: "output-property-added", severity: "breaking" }),
        ]),
      });
    }
  });

  it("treats new client-mediated requirements as breaking", () => {
    const before = createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
    );
    const after = createManifest(
      { name: "example", version: "1.1.0" },
      registry(),
      { clientRequirements: { sampling: true, elicitation: ["form"] } },
    );
    expect(diffManifests(before, after)).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({
          path: "clientRequirements.sampling",
          severity: "breaking",
        }),
        expect.objectContaining({
          path: "clientRequirements.elicitation",
          severity: "breaking",
        }),
      ]),
    });
  });

  it("applies variance to array items, type sets, and directional constraints", () => {
    const schema = (value: Record<string, unknown>) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "variance",
        description: "Exercise schema variance.",
        inputSchema: { type: "object", properties: { value }, additionalProperties: false },
        outputSchema: { type: "object", properties: { value }, additionalProperties: false },
        handler: async () => structuredResult({ value: null }),
      }),
    );
    const before = schema({ type: ["string", "number"], pattern: "^a", items: { type: "string" } });
    const after = schema({ type: ["string"], pattern: undefined });
    const changes = diffManifests(before, after).changes;
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "tools.variance.inputSchema.properties.value.items",
        code: "schema-removed",
        severity: "additive",
      }),
      expect.objectContaining({
        path: "tools.variance.outputSchema.properties.value.items",
        code: "schema-removed",
        severity: "breaking",
      }),
      expect.objectContaining({
        path: "tools.variance.inputSchema.properties.value",
        code: "schema-type-changed",
        severity: "breaking",
      }),
      expect.objectContaining({
        path: "tools.variance.outputSchema.properties.value",
        code: "schema-type-changed",
        severity: "additive",
      }),
      expect.objectContaining({
        path: "tools.variance.inputSchema.properties.value.pattern",
        code: "constraint-relaxed",
        severity: "additive",
      }),
      expect.objectContaining({
        path: "tools.variance.outputSchema.properties.value.pattern",
        code: "constraint-relaxed",
        severity: "breaking",
      }),
    ]));
  });

  it("compares effective client and extension requirements", () => {
    const base = createManifest({ name: "example", version: "1.0.0" }, registry());
    const optional = createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
      {
        clientRequirements: { sampling: false, roots: false, elicitation: [] },
        extensions: { optional: { required: false } },
      },
    );
    expect(diffManifests(base, optional).summary.breaking).toBe(0);
    const required = createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
      { extensions: { optional: { required: true } } },
    );
    expect(diffManifests(optional, required).changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "extensions.optional", severity: "breaking" }),
    ]));
  });

  it("tracks prompt argument metadata and canonicalizes object enum values", () => {
    const promptManifest = (description: string, enumValues: unknown[]) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry()
        .register({
          name: "choose",
          description: "Choose.",
          inputSchema: {
            type: "object",
            properties: { value: { enum: enumValues } },
          },
          handler: async () => structuredResult({ ok: true }),
        })
        .registerPrompt({
          name: "hello",
          arguments: [{ name: "name", description }],
          argumentsSchema: { type: "object", properties: { name: { type: "string" } } },
          get: async () => ({ messages: [] }),
        }),
    );
    const before = promptManifest("Old", [{ a: 1, b: 2 }]);
    const reordered = promptManifest("New", [{ b: 2, a: 1 }]);
    expect(diffManifests(before, reordered).changes).toEqual([
      expect.objectContaining({ code: "prompt-arguments-changed", severity: "behavioral" }),
    ]);
    expect(canonicalJson({ "ä": 1, z: 2 })).toBe('{"z":2,"ä":1}');
  });

  it("normalizes elicitation requirements and rejects malformed manifest entries", () => {
    const normalized = createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
      { clientRequirements: { elicitation: ["url", "form", "url"] } },
    );
    expect(normalized.clientRequirements?.elicitation).toEqual(["form", "url"]);
    expect(validateManifest(normalized)).toEqual(normalized);
    expect(() => validateManifest({ ...normalized, resources: [null] })).toThrow(/must be an object/);
    expect(() => validateManifest({ ...normalized, prompts: [{ name: "prompt", arguments: {} }] }))
      .toThrow(/arguments must be an array/);
    expect(() => validateManifest({
      ...normalized,
      resourceTemplates: [{ name: "static", uriTemplate: "docs://static" }],
    })).toThrow(/at least one variable/);
  });
});
