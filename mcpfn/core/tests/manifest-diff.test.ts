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

  it("allows required output additions when prior clients accept extra properties", () => {
    const before = createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "result",
        description: "Return a result.",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        handler: async () => structuredResult({ token: "value" }),
      }),
    );
    const after = structuredClone(before);
    after.tools[0]!.outputSchema = {
      type: "object",
      properties: { token: { type: "string" } },
      required: ["token"],
    };

    expect(diffManifests(before, after).changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "property-added", severity: "additive" }),
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
      tools: [{ ...manifest.tools[0], execution: { taskSupport: "sometimes" } }],
    })).toThrow(/invalid taskSupport=sometimes/);
    expect(() => validateManifest({
      ...manifest,
      prompts: [{ name: "invalid", argumentsSchema: false }],
    })).toThrow(/argumentsSchema must be an object/);
    expect(() => validateManifest({
      ...manifest,
      prompts: [{ name: "invalid", argumentsSchema: { type: "string" } }],
    })).toThrow(/argumentsSchema must be an object schema/);
    expect(() => validateManifest({
      ...manifest,
      resources: [{ uri: "docs://invalid", name: "invalid", subscribable: "yes" }],
    })).toThrow(/subscribable must be a boolean/);

    const promptManifest = createManifest(
      { name: "prompts", version: "1.0.0" },
      new McpFnRegistry().registerPrompt({
        name: "welcome",
        arguments: [{ name: "name", required: true }],
        argumentsSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        get: async () => ({ messages: [] }),
      }),
    );
    expect(() => validateManifest({
      ...promptManifest,
      prompts: [{
        ...promptManifest.prompts![0],
        arguments: [{ name: "other", required: true }],
      }],
    })).toThrow(/arguments and argumentsSchema disagree/);

    const composedPromptManifest = createManifest(
      { name: "composed-prompts", version: "1.0.0" },
      new McpFnRegistry().registerPrompt({
        name: "welcome",
        arguments: [{ name: "name", required: true }],
        argumentsSchema: {
          type: "object",
          allOf: [{
            properties: { name: { type: "string" } },
            required: ["name"],
          }],
        },
        get: async () => ({ messages: [] }),
      }),
    );
    expect(validateManifest(composedPromptManifest)).toEqual(composedPromptManifest);
  });

  it("treats closed-schema output additions as breaking", () => {
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
    expect(diffManifests(
      create(["value"], false, false),
      create(["value"], false, true),
    )).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "output-property-added", severity: "breaking" }),
      ]),
    });
  });

  it("uses schema-valued additionalProperties for output additions", () => {
    const create = (
      additionalProperties: Record<string, unknown>,
      added?: Record<string, unknown>,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "output",
        description: "Return output.",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          properties: added ? { added } : {},
          additionalProperties,
        },
        handler: async () => structuredResult({ added: "new" }),
      }),
    );

    for (const additionalProperties of [{}, { type: "string" }]) {
      expect(diffManifests(
        create(additionalProperties),
        create(additionalProperties, { type: "string" }),
      )).toMatchObject({
        compatible: true,
        changes: expect.arrayContaining([
          expect.objectContaining({ code: "property-added", severity: "additive" }),
        ]),
      });
    }
    expect(diffManifests(
      create({ type: "string" }),
      create({ type: "string" }, { type: "number" }),
    )).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "output-property-added", severity: "breaking" }),
      ]),
    });
  });

  it("treats true and an empty schema as equivalent additionalProperties", () => {
    const create = (additionalProperties: true | Record<string, never>) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "equivalent",
        description: "Accept arbitrary input.",
        inputSchema: { type: "object", additionalProperties },
        outputSchema: { type: "object", additionalProperties },
        handler: async () => structuredResult({}),
      }),
    );

    expect(diffManifests(create(true), create({})).changes).toEqual([]);
    expect(diffManifests(create({}), create(true)).changes).toEqual([]);
  });

  it("diffs schema-valued additionalProperties with directional variance", () => {
    const create = (
      direction: "input" | "output",
      additionalProperties: true | Record<string, unknown>,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "additional",
        description: "Use additional properties.",
        inputSchema: direction === "input"
          ? { type: "object", additionalProperties }
          : { type: "object" },
        ...(direction === "output"
          ? { outputSchema: { type: "object", additionalProperties } }
          : {}),
        handler: async () => structuredResult({}),
      }),
    );
    const stringSchema = { type: "string" };
    const cases = [
      ["input", stringSchema, true, true],
      ["input", true, stringSchema, false],
      ["output", true, stringSchema, true],
      ["output", stringSchema, true, false],
    ] as const;

    for (const [direction, before, after, compatible] of cases) {
      expect(diffManifests(create(direction, before), create(direction, after)).compatible)
        .toBe(compatible);
    }
  });

  it("treats equivalent JSON Schema type sets as unchanged", () => {
    const create = (type: string | string[]) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "types",
        description: "Use equivalent type declarations.",
        inputSchema: {
          type: "object",
          properties: { value: { type } },
        },
        outputSchema: {
          type: "object",
          properties: { value: { type } },
        },
        handler: async () => structuredResult({ value: "ok" }),
      }),
    );

    expect(diffManifests(
      create(["string", "null"]),
      create(["null", "string"]),
    ).changes).toEqual([]);
    expect(diffManifests(create("string"), create(["string"])).changes).toEqual([]);
  });

  it("uses the fallback input schema when a declared property is removed", () => {
    const create = (
      property: Record<string, unknown> | undefined,
      additionalProperties: boolean | Record<string, unknown>,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "input",
        description: "Accept input.",
        inputSchema: {
          type: "object",
          properties: property ? { value: property } : {},
          additionalProperties,
        },
        handler: async () => structuredResult({}),
      }),
    );

    for (const fallback of [true, {}, { type: "string" }]) {
      expect(diffManifests(
        create({ type: "string" }, false),
        create(undefined, fallback),
      )).toMatchObject({
        compatible: true,
        changes: expect.arrayContaining([
          expect.objectContaining({ code: "property-removed", severity: "additive" }),
        ]),
      });
    }
    for (const fallback of [false, { type: "number" }]) {
      expect(diffManifests(
        create({ type: "string" }, false),
        create(undefined, fallback),
      )).toMatchObject({
        compatible: false,
        changes: expect.arrayContaining([
          expect.objectContaining({ code: "property-removed", severity: "breaking" }),
        ]),
      });
    }
  });

  it("treats optional input declarations that narrow open inputs as breaking", () => {
    const create = (property?: Record<string, unknown>) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "input",
        description: "Accept input.",
        inputSchema: {
          type: "object",
          properties: property ? { value: property } : {},
        },
        handler: async () => structuredResult({}),
      }),
    );

    expect(diffManifests(create(), create({ type: "string" }))).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "property-added", severity: "breaking" }),
      ]),
    });
  });

  it("applies matching pattern schemas when an input property is removed", () => {
    const create = (
      property: Record<string, unknown> | undefined,
      patternProperty: Record<string, unknown>,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "input",
        description: "Accept input.",
        inputSchema: {
          type: "object",
          properties: property ? { pref_value: property } : {},
          patternProperties: { "^pref_": patternProperty },
        },
        handler: async () => structuredResult({}),
      }),
    );

    expect(diffManifests(
      create({ type: "string" }, { type: "string" }),
      create(undefined, { type: "number" }),
    )).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "property-removed", severity: "breaking" }),
      ]),
    });
  });

  it("diffs added, removed, and changed pattern schemas with directional variance", () => {
    const pattern = (type: string) => ({ "^pref_": { type } });
    const create = (
      direction: "input" | "output",
      patternProperties: Record<string, Record<string, unknown>>,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "patterned",
        description: "Use patterned properties.",
        inputSchema: direction === "input"
          ? { type: "object", patternProperties }
          : { type: "object" },
        ...(direction === "output"
          ? { outputSchema: { type: "object", patternProperties } }
          : {}),
        handler: async () => structuredResult({}),
      }),
    );
    const cases = [
      ["input", {}, pattern("string"), false],
      ["input", pattern("string"), {}, true],
      ["input", pattern("string"), pattern("number"), false],
      ["output", {}, pattern("string"), true],
      ["output", pattern("string"), {}, false],
      ["output", pattern("string"), pattern("number"), false],
    ] as const;

    for (const [direction, before, after, compatible] of cases) {
      const result = diffManifests(create(direction, before), create(direction, after));
      expect(result.compatible, `${direction}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
        .toBe(compatible);
      expect(result.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining(".patternProperties.^pref_") }),
      ]));
    }
  });

  it("treats potentially overlapping pattern constraints conservatively", () => {
    const create = (patternProperties: Record<string, Record<string, unknown>>) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "overlapping-patterns",
        description: "Exercise overlapping input patterns.",
        inputSchema: {
          type: "object",
          patternProperties,
          additionalProperties: false,
        },
        handler: async () => structuredResult({}),
      }),
    );

    expect(diffManifests(
      create({ "^x": { type: "string" } }),
      create({ "^x": { type: "string" }, "x$": { type: "number" } }),
    )).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({
          code: "overlapping-pattern-constraint-changed",
          severity: "breaking",
        }),
      ]),
    });
    expect(diffManifests(
      create({ "^x": { type: "string" } }),
      create({ "^x": { type: "string" }, "^y": { type: "number" } }),
    )).toMatchObject({ compatible: true });
    expect(diffManifests(
      create({ "^x": { type: "string" } }),
      create({ "^x": { type: "string" }, "x$": { type: "string" } }),
    )).toMatchObject({ compatible: true });
  });

  it("compares removed output properties with their effective fallback", () => {
    const create = (
      properties: Record<string, Record<string, unknown>>,
      required: string[] = [],
      additionalProperties: boolean | Record<string, unknown> = true,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "optional-output",
        description: "Exercise optional output properties.",
        inputSchema: { type: "object" },
        outputSchema: { type: "object", properties, required, additionalProperties },
        handler: async () => structuredResult({}),
      }),
    );

    expect(diffManifests(
      create({ value: { type: "string" } }),
      create({}),
    )).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "property-removed", severity: "breaking" }),
      ]),
    });
    expect(diffManifests(
      create({ value: { type: "string" } }),
      create({}, [], { type: "string" }),
    )).toMatchObject({ compatible: true });
    expect(diffManifests(
      create({ value: { type: "string" } }),
      create({}, [], false),
    )).toMatchObject({ compatible: true });
    expect(diffManifests(
      create({ value: { type: "string" } }, ["value"]),
      create({}),
    )).toMatchObject({ compatible: false });
  });

  it("diffs pattern additions and removals against closed and schema fallbacks", () => {
    const pattern = { "^pref_": { type: "string" } };
    const create = (
      direction: "input" | "output",
      patternProperties: Record<string, Record<string, unknown>>,
      additionalProperties: boolean | Record<string, unknown>,
    ) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "pattern-fallback",
        description: "Use pattern fallbacks.",
        inputSchema: direction === "input"
          ? { type: "object", patternProperties, additionalProperties }
          : { type: "object" },
        ...(direction === "output"
          ? { outputSchema: { type: "object", patternProperties, additionalProperties } }
          : {}),
        handler: async () => structuredResult({}),
      }),
    );

    expect(diffManifests(
      create("input", pattern, false),
      create("input", {}, false),
    ).compatible).toBe(false);
    expect(diffManifests(
      create("input", pattern, { type: "string" }),
      create("input", {}, { type: "string" }),
    ).compatible).toBe(true);
    expect(diffManifests(
      create("output", {}, false),
      create("output", pattern, false),
    ).compatible).toBe(false);
    expect(diffManifests(
      create("output", pattern, { type: "string" }),
      create("output", {}, { type: "string" }),
    ).compatible).toBe(true);
  });

  it("compares boolean property schemas by presence instead of truthiness", () => {
    const create = (property: boolean) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "input",
        description: "Accept input.",
        inputSchema: {
          type: "object",
          properties: { value: property },
        },
        handler: async () => structuredResult({}),
      }),
    );

    expect(diffManifests(create(true), create(false))).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "boolean-schema-changed", severity: "breaking" }),
      ]),
    });
  });

  it("reports per-resource subscription removal while aggregate support remains", () => {
    const create = (subscribeFirst: boolean) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry()
        .registerResource({
          uri: "docs://first",
          name: "first",
          read: async () => ({ contents: [{ uri: "docs://first", text: "First" }] }),
          ...(subscribeFirst ? {
            subscribe: async () => undefined,
            unsubscribe: async () => undefined,
          } : {}),
        })
        .registerResource({
          uri: "docs://second",
          name: "second",
          read: async () => ({ contents: [{ uri: "docs://second", text: "Second" }] }),
          subscribe: async () => undefined,
          unsubscribe: async () => undefined,
        })
        .registerResourceTemplate({
          uriTemplate: "docs://template-first/{id}",
          name: "template-first",
          read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "First" }] }),
          ...(subscribeFirst ? {
            subscribe: async () => undefined,
            unsubscribe: async () => undefined,
          } : {}),
        })
        .registerResourceTemplate({
          uriTemplate: "docs://template-second/{id}",
          name: "template-second",
          read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Second" }] }),
          subscribe: async () => undefined,
          unsubscribe: async () => undefined,
        }),
    );

    const before = create(true);
    const after = create(false);
    expect(before.capabilities?.resources).toEqual(after.capabilities?.resources);
    expect(diffManifests(before, after)).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "resource-subscription-removed", severity: "breaking" }),
        expect.objectContaining({ code: "resource-template-subscription-removed", severity: "breaking" }),
      ]),
    });
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

  it("applies directional variance to uniqueItems boolean transitions", () => {
    const schema = (uniqueItems: boolean) => createManifest(
      { name: "example", version: "1.0.0" },
      new McpFnRegistry().register({
        name: "unique-items",
        description: "Exercise unique array items.",
        inputSchema: { type: "object", properties: { value: { type: "array", uniqueItems } } },
        outputSchema: { type: "object", properties: { value: { type: "array", uniqueItems } } },
        handler: async () => structuredResult({ value: [] }),
      }),
    );

    const relaxed = diffManifests(schema(true), schema(false)).changes;
    expect(relaxed).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining("inputSchema"), severity: "additive" }),
      expect.objectContaining({ path: expect.stringContaining("outputSchema"), severity: "breaking" }),
    ]));
    const tightened = diffManifests(schema(false), schema(true)).changes;
    expect(tightened).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining("inputSchema"), severity: "breaking" }),
      expect.objectContaining({ path: expect.stringContaining("outputSchema"), severity: "additive" }),
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

  it("classifies nested capability operation removals as breaking", () => {
    const create = (tasks: Record<string, unknown>) => createManifest(
      { name: "example", version: "1.0.0" },
      registry(),
      { capabilities: { tasks } as never },
    );
    expect(diffManifests(
      create({ requests: { tools: { call: {} } }, list: {}, cancel: {} }),
      create({ requests: { tools: { call: {} } } }),
    )).toMatchObject({
      compatible: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ code: "capability-support-removed", path: "capabilities.tasks.list" }),
        expect.objectContaining({ code: "capability-support-removed", path: "capabilities.tasks.cancel" }),
      ]),
    });
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
