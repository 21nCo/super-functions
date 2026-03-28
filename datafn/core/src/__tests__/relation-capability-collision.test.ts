/**
 * Tests for relation capability field mapping and metadata collision detection (RCAP-003, RCAP-004)
 * Spec: 2026-03-07-new-q7m3k9r2-spec / PHASE_01
 */

import { describe, expect, it } from "vitest";
import { validateSchema } from "../schema.js";
import { getRelationCapabilityFieldNames, RELATION_CAPABILITY_FIELD_DEFS } from "../capabilities.js";

// Minimal base resources for schema tests
const BASE_RESOURCES = [
  { name: "todos", version: 1, fields: [{ name: "id", type: "string" as const, required: true }] },
  { name: "categories", version: 1, fields: [{ name: "id", type: "string" as const, required: true }] },
];

// ---------------------------------------------------------------------------
// RELATION_CAPABILITY_FIELD_DEFS — constant structure
// ---------------------------------------------------------------------------
describe("RELATION_CAPABILITY_FIELD_DEFS", () => {
  it("timestamps maps to createdAt and updatedAt", () => {
    const defs = RELATION_CAPABILITY_FIELD_DEFS.timestamps;
    expect(defs.map((d) => d.name)).toEqual(["createdAt", "updatedAt"]);
    expect(defs.every((d) => d.type === "date")).toBe(true);
    expect(defs.every((d) => d.readonly === true)).toBe(true);
  });

  it("audit maps to createdBy and updatedBy", () => {
    const defs = RELATION_CAPABILITY_FIELD_DEFS.audit;
    expect(defs.map((d) => d.name)).toEqual(["createdBy", "updatedBy"]);
    expect(defs.every((d) => d.type === "string")).toBe(true);
    expect(defs.every((d) => d.readonly === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRelationCapabilityFieldNames — deterministic, deduped output
// ---------------------------------------------------------------------------
describe("getRelationCapabilityFieldNames", () => {
  it("returns empty array for empty caps", () => {
    expect(getRelationCapabilityFieldNames([])).toEqual([]);
  });

  it("returns createdAt, updatedAt for [timestamps]", () => {
    expect(getRelationCapabilityFieldNames(["timestamps"])).toEqual(["createdAt", "updatedAt"]);
  });

  it("returns createdBy, updatedBy for [audit]", () => {
    expect(getRelationCapabilityFieldNames(["audit"])).toEqual(["createdBy", "updatedBy"]);
  });

  it("returns all four fields in canonical order for [timestamps, audit]", () => {
    expect(getRelationCapabilityFieldNames(["timestamps", "audit"])).toEqual([
      "createdAt", "updatedAt", "createdBy", "updatedBy",
    ]);
  });

  it("deduplicates repeated entries — [timestamps, timestamps] yields same as [timestamps]", () => {
    expect(getRelationCapabilityFieldNames(["timestamps", "timestamps"])).toEqual(["createdAt", "updatedAt"]);
  });

  it("output is deterministic across multiple calls with identical input", () => {
    const a = getRelationCapabilityFieldNames(["timestamps", "audit"]);
    const b = getRelationCapabilityFieldNames(["timestamps", "audit"]);
    expect(a).toEqual(b);
  });

  it("ignores unknown capability keys gracefully", () => {
    // resolveRelationCapabilities would reject these; this tests the helper in isolation
    expect(getRelationCapabilityFieldNames(["unknown-cap"])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TV-RCAP-003: schema validateSchema metadata collision detection
// ---------------------------------------------------------------------------
describe("RCAP-003: relation metadata collision detection", () => {
  it("TV-RCAP-003: non-colliding metadata validates (addedOrder with timestamps)", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps"],
          metadata: [{ name: "addedOrder", type: "number" }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("TV-RCAP-003 negative: createdAt metadata with timestamps returns CAPABILITY_FIELD_COLLISION", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps"],
          metadata: [{ name: "createdAt", type: "date" }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CAPABILITY_FIELD_COLLISION");
      expect(result.error.message).toContain("createdAt");
      const details = result.error.details as { path?: string };
      expect(details?.path).toBe("relations.tags.metadata.createdAt");
    }
  });

  it("TV-RCAP-003 negative: updatedAt metadata with timestamps returns CAPABILITY_FIELD_COLLISION", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps"],
          metadata: [{ name: "updatedAt", type: "date" }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CAPABILITY_FIELD_COLLISION");
    }
  });

  it("TV-RCAP-003 negative: updatedBy metadata with audit returns CAPABILITY_FIELD_COLLISION", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["audit"],
          metadata: [{ name: "updatedBy", type: "string" }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CAPABILITY_FIELD_COLLISION");
      expect(result.error.message).toContain("updatedBy");
      const details = result.error.details as { path?: string };
      expect(details?.path).toBe("relations.tags.metadata.updatedBy");
    }
  });

  it("non-colliding metadata field alongside capability validates", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps", "audit"],
          metadata: [
            { name: "addedOrder", type: "number" },
            { name: "note", type: "string" },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("metadata without capabilities has no collision (non-opt-in schema preserved)", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          metadata: [{ name: "createdAt", type: "date" }],
        },
      ],
    });
    // createdAt is allowed as user metadata when no capabilities enabled
    expect(result.ok).toBe(true);
  });
});
