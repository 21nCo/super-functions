import { describe, expect, it } from "vitest";
import { createBuiltinPublicLinkResource, ensureBuiltinPublicLinks } from "../src/public-links.js";

describe("built-in public-link schema", () => {
  it("persists the optional resource region and indexes it", () => {
    const resource = createBuiltinPublicLinkResource();
    expect(resource.version).toBe(2);
    expect(resource.fields).toContainEqual({
      name: "resourceRegion",
      type: "string",
      required: false,
    });
    expect(resource.indices).toMatchObject({
      base: expect.arrayContaining(["resourceRegion"]),
    });
  });

  it("rejects an older custom public-link schema missing the region field", () => {
    expect(() => ensureBuiltinPublicLinks({
      resources: [{
        ...createBuiltinPublicLinkResource(),
        version: 1,
        fields: createBuiltinPublicLinkResource().fields.filter(
          (field) => field.name !== "resourceRegion",
        ),
      }],
    })).toThrow("expected 2");
  });
});
