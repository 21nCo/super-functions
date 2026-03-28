import { describe, expect, it } from "vitest";
import {
  CAPABILITY_FIELD_DEFS,
  getCapabilityFields,
  resolveCapabilities,
  type AccessLevel,
  type CapabilityEntry,
} from "../capabilities.js";
import { validateSchema } from "../schema.js";
import { defineSchema } from "../types.js";

describe("capability schema types", () => {
  it("CAP-001 / TV-CAP-001: supports schema and resource capability declarations", () => {
    const schema = defineSchema({
      capabilities: ["timestamps", "audit"],
      resources: [
        {
          name: "todos",
          version: 1,
          capabilities: ["archivable"],
          fields: [{ name: "text", type: "string", required: true }],
        },
        {
          name: "docs",
          version: 1,
          capabilities: [{ shareable: { levels: ["viewer", "editor", "owner"], default: "private" } }],
          fields: [{ name: "title", type: "string", required: true }],
        },
        {
          name: "logs",
          version: 1,
          capabilities: { exclude: ["audit"] },
          fields: [{ name: "message", type: "string", required: true }],
        },
      ],
    });

    const validated = validateSchema(schema);
    expect(validated.ok).toBe(true);
  });

  it("accepts SPV2 shareable extensions and normalizes defaults", () => {
    const validated = validateSchema({
      capabilities: ["audit"],
      resources: [
        {
          name: "docs",
          version: 1,
          capabilities: [
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
                supportsScopeGrants: false,
                crossNsShareable: false,
                principalMode: "opaque-id",
                relationInheritance: {
                  enabled: true,
                  relations: ["items"],
                },
              },
            },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const caps = validated.result.resources[0].capabilities as any[];
    const shareable = caps.find((entry) => typeof entry === "object" && entry && "shareable" in entry) as any;
    expect(shareable?.shareable?.visibilityDefault).toBe("private");
    expect(shareable?.shareable?.supportsScopeGrants).toBe(false);
    expect(shareable?.shareable?.crossNsShareable).toBe(false);
    expect(shareable?.shareable?.principalMode).toBe("opaque-id");
    expect(shareable?.shareable?.relationInheritance?.enabled).toBe(true);
    expect(shareable?.shareable?.relationInheritance?.requireRelateConsent).toBe(true);
  });

  it("accepts SPV2 canonical visibilityDefault without legacy default", () => {
    const validated = validateSchema({
      capabilities: ["audit"],
      resources: [
        {
          name: "collections",
          version: 1,
          capabilities: [
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                visibilityDefault: "ns",
              },
            },
          ],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const caps = validated.result.resources[0].capabilities as any[];
    const shareable = caps.find((entry) => typeof entry === "object" && entry && "shareable" in entry) as any;
    expect(shareable?.shareable?.visibilityDefault).toBe("ns");
    expect(shareable?.shareable?.default).toBe("shared");
  });
});

describe("resolveCapabilities", () => {
  it("TV-CAP-002: returns global capabilities when resource capabilities are undefined", () => {
    expect(resolveCapabilities(["timestamps", "audit"], undefined)).toEqual([
      "timestamps",
      "audit",
    ]);
  });

  it("TV-CAP-006: merges resource additive capabilities on top of global", () => {
    expect(resolveCapabilities(["timestamps", "audit"], ["trash"])).toEqual([
      "timestamps",
      "audit",
      "trash",
    ]);
  });

  it("TV-CAP-002N: excludes global simple capabilities declared in resource.exclude", () => {
    expect(
      resolveCapabilities(["timestamps", "trash"], { exclude: ["trash"] }),
    ).toEqual(["timestamps"]);
  });

  it("handles both undefined global and resource capabilities", () => {
    expect(resolveCapabilities(undefined, undefined)).toEqual([]);
  });

  it("deduplicates capabilities deterministically", () => {
    expect(
      resolveCapabilities(["timestamps", "timestamps", "audit"], ["audit", "trash"]),
    ).toEqual(["timestamps", "audit", "trash"]);
  });

  it("supports shareable capability objects", () => {
    const shareable = {
      shareable: {
        levels: ["viewer", "editor", "owner"] as AccessLevel[],
        default: "private" as const,
      },
    };
    expect(resolveCapabilities(undefined, [shareable])).toEqual([shareable]);
  });

  it("lets resource-level shareable config override the global shareable entry", () => {
    const globalShareable = {
      shareable: {
        levels: ["viewer", "editor", "owner"] as AccessLevel[],
        default: "private" as const,
      },
    };
    const resourceShareable = {
      shareable: {
        levels: ["viewer", "editor", "owner"] as AccessLevel[],
        default: "shared" as const,
      },
    };

    expect(resolveCapabilities([globalShareable], [resourceShareable])).toEqual([
      resourceShareable,
    ]);
  });
});

describe("getCapabilityFields", () => {
  it("returns injected fields for each simple capability", () => {
    const cases: Array<{ capability: CapabilityEntry; expectedFieldNames: string[] }> = [
      { capability: "timestamps", expectedFieldNames: ["createdAt", "updatedAt"] },
      { capability: "audit", expectedFieldNames: ["createdBy", "updatedBy"] },
      { capability: "trash", expectedFieldNames: ["trashedAt", "trashedBy"] },
      { capability: "archivable", expectedFieldNames: ["isArchived"] },
    ];

    for (const { capability, expectedFieldNames } of cases) {
      const fields = getCapabilityFields([capability]);
      expect(fields.map((f) => f.name)).toEqual(expectedFieldNames);
      for (const field of fields) {
        expect(field).toHaveProperty("type");
        expect(field).toHaveProperty("nullable");
        expect(field).toHaveProperty("readonly");
        expect(field).toHaveProperty("default");
      }
    }
  });

  it("returns combined injected fields without duplicates", () => {
    const fields = getCapabilityFields([
      "timestamps",
      "audit",
      "trash",
      "archivable",
      "timestamps",
    ]);
    expect(fields.map((f) => f.name)).toEqual([
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
      "trashedAt",
      "trashedBy",
      "isArchived",
    ]);
  });

  it("returns empty array for no capabilities", () => {
    expect(getCapabilityFields([])).toEqual([]);
  });

  it("defines capability field mappings for all supported capabilities", () => {
    expect(Object.keys(CAPABILITY_FIELD_DEFS).sort()).toEqual([
      "archivable",
      "audit",
      "shareable",
      "timestamps",
      "trash",
    ]);
  });

  it("injects readonly visibility for shareable resources", () => {
    const fields = getCapabilityFields([
      { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
    ]);

    expect(fields).toEqual([
      {
        name: "visibility",
        type: "string",
        required: false,
        nullable: true,
        readonly: true,
        default: null,
      },
    ]);
  });
});
