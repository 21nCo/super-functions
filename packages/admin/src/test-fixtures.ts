import { createAdminCapabilityAdapter } from "./adapter.js";
import { defineAdminCapability } from "./manifest.js";
import type { AdminCapabilityManifest, AdminOperationHandlers } from "./types.js";

export function testManifest(
  id = "examplefn",
  overrides: Partial<AdminCapabilityManifest> = {},
): AdminCapabilityManifest {
  return defineAdminCapability({
    schemaVersion: "1.0",
    id,
    displayName: id,
    version: "1.0.0",
    description: `Operate ${id}.`,
    category: "test",
    availability: "optional-product",
    scopeLevels: ["organization", "workspace", "project", "environment"],
    dependencies: [],
    navigation: [{ id, label: id, path: `/modules/${id}`, description: `Operate ${id}.` }],
    operations: [{
      id: `${id}.records.list`,
      title: "List records",
      description: "List scoped records.",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 200 } },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: { items: { type: "array", items: { type: "object", additionalProperties: true } } },
        required: ["items"],
        additionalProperties: false,
      },
      route: { method: "GET", path: "/resources/records" },
      permission: `${id}.records.read`,
      safety: { classification: "read", idempotent: true, audit: "optional" },
      target: { resource: "records", collection: true },
      pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 200 },
      mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    }],
    ...overrides,
  });
}

export function testAdapter(
  id = "examplefn",
  overrides: Partial<AdminCapabilityManifest> = {},
  handlers?: AdminOperationHandlers,
) {
  const manifest = testManifest(id, overrides);
  return createAdminCapabilityAdapter(manifest, handlers ?? Object.fromEntries(
    manifest.operations.map((operation) => [operation.id, async () => ({ ok: true as const, data: { items: [] } })]),
  ));
}
