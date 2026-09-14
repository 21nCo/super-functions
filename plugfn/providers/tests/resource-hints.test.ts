import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { selectedResources } from "../src/shared/selected-resources.js";

describe("selected resource manifest compatibility", () => {
  it("preserves the reviewed manifest before template extraction", () => {
    // Captured from commit 896545d before refactoring; ordering is part of the hash.
    expect(
      createHash("sha256")
        .update(JSON.stringify(selectedResources))
        .digest("hex"),
    ).toBe("20d11f6794164ffcbc912fc10010d74dc59728b4e52b9b25dc1b461e9ce02b60");
  });

  it("keeps every action's mutable hints independent", () => {
    const arrays = Object.values(selectedResources).flatMap(Object.values);
    expect(new Set(arrays).size).toBe(arrays.length);
    const hints = arrays.flat();
    expect(new Set(hints).size).toBe(hints.length);
  });
});
