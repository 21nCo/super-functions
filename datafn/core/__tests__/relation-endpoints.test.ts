import { describe, expect, it } from "vitest";
import { resolveEndpointResource } from "../src/relation-endpoints.js";

describe("relation endpoint resolution", () => {
  const schema = {
    resources: [
      { name: "documents", idPrefix: "doc" },
      { name: "operations", idPrefix: "op_" },
      { name: "notes", idPrefix: "note:" },
    ],
  };

  it("resolves polymorphic endpoints using schema idPrefix values", () => {
    expect(
      resolveEndpointResource(["documents", "operations"], "op_42", schema),
    ).toBe("operations");
    expect(
      resolveEndpointResource(["documents", "notes"], "note:42", schema),
    ).toBe("notes");
  });

  it("prefers the longest matching custom prefix", () => {
    const overlapping = {
      resources: [
        { name: "short", idPrefix: "item" },
        { name: "long", idPrefix: "item-special:" },
      ],
    };
    expect(
      resolveEndpointResource(["short", "long"], "item-special:42", overlapping),
    ).toBe("long");
  });
});
