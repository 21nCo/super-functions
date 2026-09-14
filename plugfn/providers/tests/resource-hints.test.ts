import { describe, expect, it } from "vitest";
import { selectedResources } from "../src/shared/selected-resources.js";

describe("selected resource manifest compatibility", () => {

  it("keeps every action's mutable hints independent", () => {
    const arrays = Object.values(selectedResources).flatMap(Object.values);
    expect(new Set(arrays).size).toBe(arrays.length);
    const hints = arrays.flat();
    expect(new Set(hints).size).toBe(hints.length);
  });
});
