/**
 * Tests for relation capability schema contract (RCAP-001, RCAP-002, RCAP-004)
 * Spec: 2026-03-07-new-q7m3k9r2-spec / PHASE_00
 */

import { describe, expect, it } from "vitest";
import { validateSchema } from "../schema.js";
import { resolveRelationCapabilities } from "../schema.js";

// Minimal base resources for schema tests
const BASE_RESOURCES = [
  { name: "todos", version: 1, fields: [{ name: "id", type: "string" as const, required: true }] },
  { name: "categories", version: 1, fields: [{ name: "id", type: "string" as const, required: true }] },
];

// ---------------------------------------------------------------------------
// TV-RCAP-001: DatafnRelationSchema accepts optional capabilities on many-many
// ---------------------------------------------------------------------------
describe("RCAP-001: relation schema capabilities field", () => {
  it("TV-RCAP-001: accepts many-many relation with capabilities: [timestamps, audit]", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps", "audit"],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("TV-RCAP-001: omitted capabilities preserves current behavior (no error)", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("TV-RCAP-001 negative: capabilities as string (non-array) returns SCHEMA_INVALID", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: "timestamps" as unknown as string[],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
    }
  });
});

// ---------------------------------------------------------------------------
// TV-RCAP-002: Only timestamps/audit accepted; non-many-many is rejected
// ---------------------------------------------------------------------------
describe("RCAP-002: relation capability value and type constraints", () => {
  it("TV-RCAP-002: many-many with capabilities: [timestamps] validates", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps"],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("TV-RCAP-002: many-many with capabilities: [audit] validates", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["audit"],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("TV-RCAP-002 negative A: unknown capability value returns INVALID_CAPABILITY", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["trash"] as unknown as ("timestamps" | "audit")[],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CAPABILITY");
    }
  });

  it("TV-RCAP-002 negative B: one-many with capabilities returns SCHEMA_INVALID", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "one-many",
          relation: "tags",
          capabilities: ["timestamps"] as unknown as ("timestamps" | "audit")[],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
    }
  });

  it("many-one with capabilities returns SCHEMA_INVALID", () => {
    const result = validateSchema({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-one",
          relation: "tags",
          capabilities: ["timestamps"] as unknown as ("timestamps" | "audit")[],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
    }
  });
});

// ---------------------------------------------------------------------------
// TV-RCAP-004: resolveRelationCapabilities is deterministic, deduplicates,
// and returns canonical order ["timestamps", "audit"]
// ---------------------------------------------------------------------------
describe("RCAP-004: resolveRelationCapabilities determinism and canonical order", () => {
  it("TV-RCAP-004: undefined capabilities returns empty array", () => {
    const result = resolveRelationCapabilities(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual([]);
    }
  });

  it("TV-RCAP-004: [audit, timestamps, audit] deduplicates and returns canonical [timestamps, audit]", () => {
    const result = resolveRelationCapabilities(["audit", "timestamps", "audit"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual(["timestamps", "audit"]);
    }
  });

  it("TV-RCAP-004: [audit] alone returns [audit]", () => {
    const result = resolveRelationCapabilities(["audit"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual(["audit"]);
    }
  });

  it("TV-RCAP-004: [timestamps] alone returns [timestamps]", () => {
    const result = resolveRelationCapabilities(["timestamps"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual(["timestamps"]);
    }
  });

  it("TV-RCAP-004: [timestamps, audit] in canonical order stays canonical", () => {
    const result = resolveRelationCapabilities(["timestamps", "audit"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual(["timestamps", "audit"]);
    }
  });

  it("TV-RCAP-004: repeated calls with identical input yield identical output", () => {
    const a = resolveRelationCapabilities(["audit", "timestamps"]);
    const b = resolveRelationCapabilities(["audit", "timestamps"]);
    expect(a).toEqual(b);
    if (a.ok && b.ok) {
      expect(a.result).toEqual(["timestamps", "audit"]);
    }
  });

  it("TV-RCAP-004 negative: non-string entry returns SCHEMA_INVALID", () => {
    const result = resolveRelationCapabilities(["timestamps", 123]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
    }
  });

  it("TV-RCAP-004 negative: non-array returns SCHEMA_INVALID", () => {
    const result = resolveRelationCapabilities("timestamps");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
    }
  });
});
