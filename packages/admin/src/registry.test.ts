import { describe, expect, it } from "vitest";
import { createAdminCapabilityAdapter } from "./adapter.js";
import { AdminError } from "./errors.js";
import { createAdminRegistry } from "./registry.js";
import { testAdapter, testManifest } from "./test-fixtures.js";
import { validateAdminCapabilityManifest } from "./validator.js";

describe("AdminCapabilityRegistry", () => {
  it("exposes only explicitly enabled modules and permits a shell-only install", () => {
    const first = testAdapter("firstfn");
    const second = testAdapter("secondfn");
    const registry = createAdminRegistry({
      adapters: [first, second],
      enabledModules: ["secondfn"],
    });
    expect(registry.enabledModuleIds).toEqual(["secondfn"]);
    expect(
      registry.operations.every((entry) => entry.moduleId === "secondfn"),
    ).toBe(true);
    expect(registry.navigation.map((entry) => entry.moduleId)).toEqual([
      "secondfn",
    ]);
    expect(registry.getManifest("firstfn")).toBeUndefined();
    expect(JSON.stringify(registry.toJSON())).not.toContain("firstfn");
    expect(registry.matchMcpTool("superconsole_firstfn_records_list")).toBeUndefined();
    expect(
      createAdminRegistry({ adapters: [first], enabledModules: [] }).operations,
    ).toEqual([]);
  });

  it("fails closed when the explicit allowlist is missing at runtime", () => {
    expect(() => createAdminRegistry({ adapters: [] } as never)).toThrowError(
      /explicit enabledModules/,
    );
  });

  it("refuses to enable a manifest whose domain binding is explicitly unavailable", () => {
    const manifest = testManifest("blockedfn", {
      availability: "unavailable",
      unavailableReason: "No canonical operator service exists.",
      navigation: [],
      resources: [],
      operations: [],
    });
    const adapter = createAdminCapabilityAdapter(manifest, {});
    expect(validateAdminCapabilityManifest(manifest)).toEqual([]);
    expect(() => createAdminRegistry({ adapters: [adapter], enabledModules: ["blockedfn"] }))
      .toThrowError(/not domain-backed/);
    expect(createAdminRegistry({ adapters: [adapter], enabledModules: [] }).operations).toEqual([]);
  });

  it("refuses to enable a folded child as an independent module", () => {
    const manifest = testManifest("contentfn", {
      availability: "folded",
      owner: { moduleId: "cmsfn", mountPath: "/modules/cmsfn/content" },
      dependencies: ["cmsfn"],
      navigation: [],
      resources: [],
      operations: [],
    });
    const adapter = createAdminCapabilityAdapter(manifest, {});
    expect(validateAdminCapabilityManifest(manifest)).toEqual([]);
    expect(() => createAdminRegistry({ adapters: [adapter], enabledModules: ["contentfn"] }))
      .toThrowError(/folded into cmsfn/);
  });

  it("fails startup for missing or unknown adapter handlers", () => {
    const manifest = testManifest("examplefn");
    expect(() => createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {})],
      enabledModules: ["examplefn"],
    })).toThrowError(/exact handler coverage/);
    expect(() => createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        [manifest.operations[0]!.id]: async () => ({ ok: true as const, data: { items: [] } }),
        "examplefn.records.typo": async () => ({ ok: true as const, data: { items: [] } }),
      })],
      enabledModules: ["examplefn"],
    })).toThrowError(/exact handler coverage/);
  });

  it("orders dependencies before dependents and requires nested owners", () => {
    const owner = testAdapter("ownerfn");
    const nested = testAdapter("nestedfn", {
      availability: "nested",
      owner: { moduleId: "ownerfn", mountPath: "/modules/ownerfn/nested" },
      dependencies: ["ownerfn"],
      navigation: [
        {
          id: "nestedfn",
          label: "nestedfn",
          path: "/modules/ownerfn/nested",
        },
      ],
    });
    expect(() =>
      createAdminRegistry({
        adapters: [owner, nested],
        enabledModules: ["nestedfn"],
      }),
    ).toThrowError(/requires enabled module ownerfn/);
    const registry = createAdminRegistry({
      adapters: [nested, owner],
      enabledModules: ["nestedfn", "ownerfn"],
    });
    expect(registry.enabledModuleIds).toEqual(["ownerfn", "nestedfn"]);
    expect(
      registry.navigation.find((entry) => entry.moduleId === "nestedfn")
        ?.ownerModuleId,
    ).toBe("ownerfn");
  });

  it("detects dependency cycles", () => {
    const first = testAdapter("firstfn", { dependencies: ["secondfn"] });
    const second = testAdapter("secondfn", { dependencies: ["firstfn"] });
    expect(() =>
      createAdminRegistry({
        adapters: [first, second],
        enabledModules: ["firstfn", "secondfn"],
      }),
    ).toThrowError(/dependency cycle/);
  });

  it("detects operation and parameter-equivalent route collisions", () => {
    const manifest = testManifest("examplefn");
    const operation = manifest.operations[0]!;
    const invalid = testManifest("examplefn", {
      operations: [
        {
          ...operation,
          id: "examplefn.records.first",
          route: { method: "GET", path: "/records/:id" },
        },
        {
          ...operation,
          id: "examplefn.records.second",
          route: { method: "GET", path: "/records/{recordId}" },
        },
      ],
    });
    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(
      expect.objectContaining({ message: "duplicates another route" }),
    );
    expect(() =>
      createAdminRegistry({
        adapters: [createAdminCapabilityAdapter(invalid, {})],
        enabledModules: ["examplefn"],
      }),
    ).toThrow(AdminError);
  });

  it("matches concrete paths against parameterized registry routes", () => {
    const manifest = testManifest("examplefn");
    const operation = manifest.operations[0]!;
    const adapter = createAdminCapabilityAdapter(
      testManifest("examplefn", {
        operations: [
          {
            ...operation,
            inputSchema: {
              type: "object",
              properties: { id: { type: "string", minLength: 1 } },
              required: ["id"],
              additionalProperties: false,
            },
            route: { method: "GET", path: "/records/:id" },
            target: { resource: "records", idInput: "id" },
          },
        ],
      }),
      { [operation.id]: async () => ({ ok: true as const, data: { items: [] } }) },
    );
    const registry = createAdminRegistry({
      adapters: [adapter],
      enabledModules: ["examplefn"],
    });
    expect(
      registry.matchRoute(
        "GET",
        "/api/admin/v1/modules/examplefn/records/record-1",
      )?.operation.id,
    ).toBe(operation.id);
  });
});

describe("manifest validation", () => {
  it("rejects external, ambiguous, traversing, and cross-module navigation paths", () => {
    const unsafePaths = [
      "https://evil.example/modules/examplefn",
      "//evil.example/modules/examplefn",
      "/modules/examplefn@evil.example/path",
      "/modules/examplefn/%2e%2e/authfn",
      "/modules/examplefn?next=//evil.example",
      "/modules/examplefn\\credentials",
      "/modules/otherfn",
    ];

    for (const path of unsafePaths) {
      const invalid = testManifest("examplefn", {
        navigation: [{ id: "examplefn", label: "ExampleFn", path }],
      });
      expect(
        validateAdminCapabilityManifest(invalid).some(
          (issue) => issue.path === "$.navigation[0].path",
        ),
        path,
      ).toBe(true);
    }
  });

  it("requires nested mounts under their owner and safe health and route paths", () => {
    const nested = testManifest("nestedfn", {
      availability: "nested",
      owner: { moduleId: "ownerfn", mountPath: "/modules/otherfn/nested" },
      navigation: [
        {
          id: "nestedfn",
          label: "NestedFn",
          path: "/modules/ownerfn/nestedfn",
        },
      ],
      health: { path: "//health.example/status" },
      operations: [
        {
          ...testManifest("nestedfn").operations[0]!,
          route: "GET /resources/%2e%2e/secrets",
        },
      ],
    });
    const issues = validateAdminCapabilityManifest(nested);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "$.owner.mountPath",
          message: "must be mounted under /modules/ownerfn",
        }),
        expect.objectContaining({ path: "$.health.path" }),
        expect.objectContaining({ path: "$.operations[0].route" }),
      ]),
    );
  });

  it("requires health metadata to resolve to a declared read operation", () => {
    const base = testManifest("examplefn");
    const missing = testManifest("examplefn", {
      health: { operationId: "examplefn.health.list" },
    });
    const phantomPath = testManifest("examplefn", {
      health: { path: "/health" },
    });
    const nonRead = testManifest("examplefn", {
      health: { operationId: "examplefn.records.refresh" },
      operations: [
        {
          ...base.operations[0]!,
          id: "examplefn.records.refresh",
          route: { method: "POST", path: "/resources/records/refresh" },
          safety: { classification: "write", idempotent: true, audit: "required" },
          mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
      ],
    });

    expect(validateAdminCapabilityManifest(missing)).toContainEqual(
      expect.objectContaining({
        path: "$.health.operationId",
        message: "must name a declared operation",
      }),
    );
    expect(validateAdminCapabilityManifest(phantomPath)).toContainEqual(
      expect.objectContaining({
        path: "$.health.path",
        message: "must exactly match a declared read route",
      }),
    );
    expect(validateAdminCapabilityManifest(nonRead)).toContainEqual(
      expect.objectContaining({
        path: "$.health.operationId",
        message: "must name a read operation",
      }),
    );
    expect(
      validateAdminCapabilityManifest(
        testManifest("examplefn", {
          health: { operationId: "examplefn.records.list" },
        }),
      ).filter((issue) => issue.path.startsWith("$.health")),
    ).toEqual([]);
  });

  it("requires explicit target semantics for every operation", () => {
    const manifest = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [
        {
          ...manifest.operations[0]!,
          target: undefined,
        } as unknown as (typeof manifest.operations)[number],
      ],
    });

    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(
      expect.objectContaining({
        path: "$.operations[0].target",
        message: "operations must declare a resource or collection target",
      }),
    );
  });

  it("rejects unsafe destructive operations", () => {
    const manifest = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [
        {
          ...manifest.operations[0]!,
          safety: {
            classification: "destructive",
            idempotent: true,
            audit: "optional",
            requiresConfirmation: false,
          },
        },
      ],
    });
    const issues = validateAdminCapabilityManifest(invalid);
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "mutations must require audit",
        "destructive operations must require confirmation",
        "destructive targets must identify one resource",
      ]),
    );
  });

  it("requires destructive target identifiers in the input contract", () => {
    const manifest = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [
        {
          ...manifest.operations[0]!,
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            additionalProperties: false,
          },
          safety: {
            classification: "destructive",
            idempotent: true,
            audit: "required",
            requiresConfirmation: true,
          },
          target: { resource: "records", idInput: "id" },
        },
      ],
    });
    expect(
      validateAdminCapabilityManifest(invalid).map((issue) => issue.message),
    ).toContain("must require the target idInput");
  });

  it("treats the declared target as authoritative over operation-id segments", () => {
    const manifest = testManifest("examplefn");
    const valid = testManifest("examplefn", {
      operations: [
        {
          ...manifest.operations[0]!,
          id: "examplefn.enumerate",
          target: { resource: "records", collection: true },
        },
      ],
    });

    expect(validateAdminCapabilityManifest(valid)).toEqual([]);
  });

  it("requires audit whenever an operation declares sensitive fields", () => {
    const manifest = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [
        {
          ...manifest.operations[0]!,
          redaction: { outputFields: ["privateBody"] },
          safety: {
            classification: "read",
            idempotent: true,
            audit: "optional",
          },
        },
      ],
    });

    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(
      expect.objectContaining({
        path: "$.operations[0].safety.audit",
        message: "operations with declared sensitive fields must require audit",
      }),
    );
  });

  it("rejects ambiguous sensitive field declarations", () => {
    const manifest = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [
        {
          ...manifest.operations[0]!,
          redaction: { outputFields: ["apiKey", "api_key", "payload.secret"] },
          safety: {
            classification: "read",
            idempotent: true,
            audit: "required",
          },
        },
      ],
    });
    const messages = validateAdminCapabilityManifest(invalid).map(
      (issue) => issue.message,
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        "must contain unique normalized field names",
        "must contain simple field names rather than paths",
      ]),
    );
  });

  it("allows one-time output secrets only on strongly confirmed non-idempotent operations", () => {
    const base = testManifest("examplefn").operations[0]!;
    const invalid = testManifest("examplefn", { operations: [{
      ...base,
      outputSchema: { type: "object", properties: { token: { type: "string" } }, required: ["token"], additionalProperties: false },
      redaction: { allowOutputPaths: ["$.token"] },
      safety: { classification: "write", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Issue one token." }, audit: "required" },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    }] });
    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(expect.objectContaining({
      path: "$.operations[0].redaction.allowOutputPaths",
      message: "one-time output secrets require audited, confirmed, non-idempotent recent-auth, MFA, or approval",
    }));
  });

  it("rejects non-exact, dangling, and structurally invalid one-time output paths", () => {
    const base = testManifest("examplefn").operations[0]!;
    const invalid = testManifest("examplefn", { operations: [{
      ...base,
      outputSchema: {
        type: "object",
        properties: {
          item: { type: "object", properties: { token: { type: "string" } }, additionalProperties: false },
          items: { type: "array", items: { type: "object", properties: { token: { type: "string" } }, additionalProperties: false } },
        },
        additionalProperties: false,
      },
      redaction: { allowOutputPaths: ["token", "$.missing.token", "$.items.token", "$.items[*]"] },
      safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "mfa", reason: "Issue one-time credentials." }, audit: "required" },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    }] });
    expect(validateAdminCapabilityManifest(invalid)).toContainEqual({
      path: "$.operations[0].redaction.allowOutputPaths",
      message: "must contain exact JSON paths through closed non-union objects and explicit array wildcards to string scalar leaves",
    });
  });

  it("rejects one-time paths through open or union schemas and non-string leaves", () => {
    const base = testManifest("examplefn").operations[0]!;
    const invalid = testManifest("examplefn", { operations: [{
      ...base,
      outputSchema: {
        type: "object",
        properties: {
          open: { type: "object", properties: { token: { type: "string" } }, additionalProperties: true },
          union: { type: "object", additionalProperties: false, oneOf: [{ type: "object" }], properties: { token: { type: "string" } } },
          numeric: { type: "object", properties: { token: { type: "integer" } }, additionalProperties: false },
        },
        additionalProperties: false,
      },
      redaction: { allowOutputPaths: ["$.open.token", "$.union.token", "$.numeric.token"] },
      safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "mfa", reason: "Issue credentials." }, audit: "required" },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    }] });
    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(expect.objectContaining({
      path: "$.operations[0].redaction.allowOutputPaths",
    }));
  });

  it("rejects destructive collection targets", () => {
    const manifest = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [
        {
          ...manifest.operations[0]!,
          safety: {
            classification: "destructive",
            idempotent: true,
            audit: "required",
            requiresConfirmation: true,
          },
          target: { resource: "records", collection: true },
          mcp: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
          },
        },
      ],
    });

    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(
      expect.objectContaining({
        path: "$.operations[0].target",
        message: "destructive targets must identify one resource",
      }),
    );
  });

  it("compiles every nested schema regex during registry startup", () => {
    const base = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [{
        ...base.operations[0]!,
        inputSchema: {
          type: "object",
          properties: { filter: { type: "object", properties: { name: { type: "string", pattern: "[" } } } },
          additionalProperties: false,
        },
      }],
    });
    const issues = validateAdminCapabilityManifest(invalid);
    expect(issues).toContainEqual(expect.objectContaining({
      path: "$.operations[0].inputSchema.properties.filter.properties.name.pattern",
      message: "must be a valid regular expression",
    }));
    expect(() => createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(invalid, { "examplefn.records.list": async () => ({ items: [] }) })],
      enabledModules: ["examplefn"],
    })).toThrow(/Invalid admin capability manifest/);
  });

  it("validates resource and operation minimum scope inheritance", () => {
    const base = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      scopeLevels: ["installation", "workspace", "project", "environment"],
      resources: [{
        id: "records",
        label: "Records",
        description: "Records.",
        risk: "sensitive",
        idField: "id",
        minimumScope: "project",
      }],
      operations: [{ ...base.operations[0]!, minimumScope: "workspace" }],
    });
    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(expect.objectContaining({
      path: "$.operations[0].minimumScope",
      message: "must be the resource minimum scope or a deeper descendant",
    }));
    const compatibleAlias = testManifest("examplefn", {
      scopeLevels: ["installation", "organization"],
    });
    expect(validateAdminCapabilityManifest(compatibleAlias)).toContainEqual(expect.objectContaining({
      path: "$.scopeLevels",
      message: "must not contain duplicate scope levels",
    }));
  });

  it("requires high-risk confirmation metadata to activate confirmation", () => {
    const base = testManifest("examplefn");
    const invalid = testManifest("examplefn", {
      operations: [{
        ...base.operations[0]!,
        safety: {
          ...base.operations[0]!.safety,
          confirmation: { risk: "high", method: "mfa", reason: "Rotate production credentials." },
        },
      }],
    });
    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(expect.objectContaining({
      path: "$.operations[0].safety.requiresConfirmation",
      message: "must be true when high-risk confirmation metadata is declared",
    }));
  });

  it("validates non-authoritative generic resource presentation metadata", () => {
    const base = testManifest("examplefn");
    const valid = testManifest("examplefn", {
      resources: [{
        id: "records",
        label: "Records",
        description: "Presented records.",
        risk: "standard",
        idField: "id",
        sortableFields: ["createdAt"],
        presentation: {
          listOperationId: "examplefn.records.list",
          titleField: "name",
          columns: [{ field: "id", label: "Record", format: "code" }],
          defaultSort: { field: "createdAt", direction: "desc" },
        },
      }],
    });
    expect(validateAdminCapabilityManifest(valid)).toEqual([]);

    const invalid = testManifest("examplefn", {
      resources: [{
        ...valid.resources![0]!,
        presentation: {
          listOperationId: "examplefn.records.missing",
          columns: [{ field: "id", label: "" }, { field: "id", label: "Duplicate" }],
          defaultSort: { field: "undeclared", direction: "asc" },
        },
      }],
      operations: base.operations,
    });
    const messages = validateAdminCapabilityManifest(invalid).map((issue) => issue.message);
    expect(messages).toContain("must name an operation in the same manifest");
    expect(messages).toContain("must not contain duplicate fields");
    expect(messages).toContain("must not be empty");
    expect(messages).toContain("must be declared in sortableFields");
  });

  it("requires defaultSort fields to be explicitly sortable", () => {
    const invalid = testManifest("examplefn", {
      resources: [{
        id: "records",
        label: "Records",
        description: "Presented records.",
        risk: "standard",
        idField: "id",
        presentation: {
          listOperationId: "examplefn.records.list",
          defaultSort: { field: "createdAt", direction: "desc" },
        },
      }],
    });
    expect(validateAdminCapabilityManifest(invalid)).toContainEqual(expect.objectContaining({
      path: "$.resources[0].presentation.defaultSort.field",
      message: "must be declared in sortableFields",
    }));
  });

  it("collects a presentation target issue instead of throwing for malformed operations", () => {
    const base = testManifest("examplefn");
    const malformed = testManifest("examplefn", {
      resources: [{
        id: "records",
        label: "Records",
        description: "Presented records.",
        risk: "standard",
        idField: "id",
        presentation: { listOperationId: "examplefn.records.list" },
      }],
      operations: [{ ...base.operations[0]!, target: undefined }],
    });
    expect(() => validateAdminCapabilityManifest(malformed)).not.toThrow();
    expect(validateAdminCapabilityManifest(malformed)).toContainEqual(expect.objectContaining({
      path: "$.resources[0].presentation.listOperationId",
      message: "must name a read operation targeting this resource",
    }));
  });

  it("validates list and detail presentation fields against their consuming surfaces", () => {
    const base = testManifest("examplefn").operations[0]!;
    const recordId = { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false };
    const recordDetail = { type: "object" as const, properties: { id: { type: "string" }, name: { type: "string" } }, required: ["id", "name"], additionalProperties: false };
    const valid = testManifest("examplefn", {
      resources: [{
        id: "records",
        label: "Records",
        description: "Presented records.",
        risk: "standard",
        idField: "id",
        presentation: {
          listOperationId: "examplefn.enumerate",
          detailOperationId: "examplefn.inspect",
          titleField: "name",
          columns: [{ field: "id", label: "Record" }],
        },
      }],
      operations: [
        {
          ...base,
          id: "examplefn.enumerate",
          outputSchema: { type: "object", properties: { items: { type: "array", items: recordId } }, required: ["items"], additionalProperties: false },
          target: { resource: "records", collection: true },
        },
        {
          ...base,
          id: "examplefn.inspect",
          inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
          outputSchema: { type: "object", properties: { item: recordDetail }, required: ["item"], additionalProperties: false },
          route: { method: "GET", path: "/resources/records/:id" },
          target: { resource: "records", idInput: "id" },
        },
      ],
    });
    expect(validateAdminCapabilityManifest(valid)).toEqual([]);
  });

  it("validates contextual resource bindings and list query mappings", () => {
    const base = testManifest("examplefn").operations[0]!;
    const operation = {
      ...base,
      inputSchema: {
        type: "object" as const,
        properties: {
          filter: {
            type: "object" as const,
            properties: { parentId: { type: "string" as const } },
            required: ["parentId"],
            additionalProperties: false,
          },
        },
        required: ["filter"],
        additionalProperties: false,
      },
    };
    const valid = testManifest("examplefn", {
      resources: [
        { id: "parents", label: "Parents", description: "Parent records.", risk: "standard", idField: "id" },
        {
          id: "records", label: "Records", description: "Child records.", risk: "standard", idField: "id",
          filterableFields: ["parentId"],
          presentation: {
            standaloneList: false,
            listOperationId: operation.id,
            query: { filters: [{ field: "parentId", inputPath: "filter.parentId" }] },
            parent: { resourceId: "parents", bindings: [{ sourceField: "id", queryField: "parentId" }] },
          },
        },
      ],
      operations: [operation],
    });
    expect(validateAdminCapabilityManifest(valid)).toEqual([]);

    const invalid = testManifest("examplefn", {
      resources: [{
        id: "records", label: "Records", description: "Child records.", risk: "standard", idField: "id",
        presentation: {
          standaloneList: false,
          listOperationId: operation.id,
          query: { filters: [{ field: "missing", inputPath: "filter.missing" }] },
        },
      }],
      operations: [operation],
    });
    const issues = validateAdminCapabilityManifest(invalid);
    expect(issues).toContainEqual(expect.objectContaining({
      path: "$.resources[0].presentation.parent",
      message: "is required when standaloneList is false",
    }));
    expect(issues).toContainEqual(expect.objectContaining({
      path: "$.resources[0].presentation.query.filters[0].inputPath",
      message: "must resolve in the list operation input schema",
    }));
  });

  it("rejects presentation input paths that address prototype properties", () => {
    const operation = {
      ...testManifest("examplefn").operations[0]!,
      inputSchema: {
        type: "object" as const,
        properties: {
          constructor: {
            type: "object" as const,
            properties: { value: { type: "string" as const } },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    };
    const manifest = testManifest("examplefn", {
      resources: [{
        id: "records", label: "Records", description: "Records.", risk: "standard", idField: "id",
        filterableFields: ["value"],
        presentation: {
          listOperationId: operation.id,
          query: { filters: [{ field: "value", inputPath: "constructor.value" }] },
        },
      }],
      operations: [operation],
    });
    expect(validateAdminCapabilityManifest(manifest)).toContainEqual(expect.objectContaining({
      path: "$.resources[0].presentation.query.filters[0].inputPath",
      message: "must resolve in the list operation input schema",
    }));
  });
});
