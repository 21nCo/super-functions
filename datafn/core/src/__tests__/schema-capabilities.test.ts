import { describe, expect, it } from "vitest";
import { buildSchemaIndex } from "../schema-index.js";
import { validateSchema } from "../schema.js";

describe("validateSchema capability integration", () => {
  it("TV-CAP-003: injects capability fields into effective fields and SchemaIndex", () => {
    const result = validateSchema({
      capabilities: ["timestamps", "audit"],
      resources: [
        {
          name: "todos",
          version: 1,
          fields: [{ name: "text", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const index = buildSchemaIndex(result.result);
    const fields = index.fieldsByResource.get("todos");
    expect(fields).toBeDefined();
    expect(fields?.has("text")).toBe(true);
    expect(fields?.has("createdAt")).toBe(true);
    expect(fields?.has("updatedAt")).toBe(true);
    expect(fields?.has("createdBy")).toBe(true);
    expect(fields?.has("updatedBy")).toBe(true);
  });

  it("TV-VA-001N: rejects invalid capability name", () => {
    const result = validateSchema({
      capabilities: ["softDelete"],
      resources: [
        {
          name: "todos",
          version: 1,
          fields: [{ name: "text", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CAPABILITY");
      expect(result.error.message).toContain("softDelete");
    }
  });

  it("rejects shareable string form without object config", () => {
    const result = validateSchema({
      capabilities: ["shareable"],
      resources: [
        {
          name: "docs",
          version: 1,
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CAPABILITY_CONFIG");
    }
  });

  it("TV-CAP-004N: detects capability field collisions", () => {
    const result = validateSchema({
      capabilities: ["timestamps"],
      resources: [
        {
          name: "todos",
          version: 1,
          fields: [
            { name: "text", type: "string", required: true },
            { name: "createdAt", type: "date", required: true },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CAPABILITY_FIELD_COLLISION");
      expect(result.error.message).toContain("createdAt");
      expect(result.error.message).toContain("timestamps");
    }
  });

  it("TV-SH-011N: rejects shareable without audit", () => {
    const result = validateSchema({
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [{ shareable: { levels: ["viewer", "editor", "owner"], default: "private" } }],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CAPABILITY_DEPENDENCY");
      expect(result.error.message).toBe(
        `"shareable" capability requires "audit" capability`,
      );
    }
  });

  it("accepts shareable with audit and global audit + resource shareable", () => {
    const direct = validateSchema({
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            "audit",
            { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });
    expect(direct.ok).toBe(true);

    const merged = validateSchema({
      capabilities: ["audit"],
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });
    expect(merged.ok).toBe(true);
  });

  it("rejects shareable with invalid visibilityDefault", () => {
    const result = validateSchema({
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            "audit",
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
                visibilityDefault: "cross-shared",
              },
            },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CAPABILITY_CONFIG");
      expect(result.error.message).toContain("visibilityDefault");
    }
  });

  it("rejects shareable when both default and visibilityDefault are omitted", () => {
    const result = validateSchema({
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            "audit",
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
              },
            },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CAPABILITY_CONFIG");
      expect(result.error.message).toContain("shareable.default");
      expect(result.error.message).toContain("visibilityDefault");
    }
  });

  it("rejects shareable with non-boolean supportsScopeGrants", () => {
    const result = validateSchema({
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            "audit",
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
                supportsScopeGrants: "yes",
              },
            },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CAPABILITY_CONFIG");
      expect(result.error.message).toContain("supportsScopeGrants");
    }
  });

  it("rejects shareable with invalid relationInheritance config", () => {
    const result = validateSchema({
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            "audit",
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
                relationInheritance: {
                  enabled: true,
                  relations: [123],
                },
              },
            },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CAPABILITY_CONFIG");
      expect(result.error.message).toContain("relationInheritance.relations");
    }
  });

  it("accepts shareable with SPV2 extension fields", () => {
    const result = validateSchema({
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            "audit",
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
                visibilityDefault: "ns",
                supportsScopeGrants: true,
                crossNsShareable: true,
                principalMode: "opaque-id",
                relationInheritance: {
                  enabled: true,
                  relations: ["items"],
                  requireRelateConsent: false,
                },
              },
            },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const caps = result.result.resources[0].capabilities as any[];
      const shareable = caps.find((entry) => typeof entry === "object" && entry && "shareable" in entry) as any;
      expect(shareable.shareable.visibilityDefault).toBe("ns");
      expect(shareable.shareable.supportsScopeGrants).toBe(true);
      expect(shareable.shareable.crossNsShareable).toBe(true);
      expect(shareable.shareable.principalMode).toBe("opaque-id");
      expect(shareable.shareable.relationInheritance.requireRelateConsent).toBe(false);
    }
  });

  it("TV-VA-001: deduplicates duplicate capabilities without error", () => {
    const result = validateSchema({
      capabilities: ["timestamps", "timestamps"],
      resources: [
        {
          name: "todos",
          version: 1,
          fields: [{ name: "text", type: "string", required: true }],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.capabilities).toEqual(["timestamps"]);
    }
  });
});
