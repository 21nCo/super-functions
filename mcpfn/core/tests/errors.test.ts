import { describe, expect, it } from "vitest";
import { McpFnError, errorResult } from "../src/errors.js";

describe("McpFn error envelopes", () => {
  it("preserves the stable envelope when details cannot be serialized", () => {
    const details = { toJSON() { throw new Error("cannot serialize"); } };
    const result = errorResult(new McpFnError("STABLE_CODE", "Stable message", details));
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "STABLE_CODE",
        message: "Stable message",
        details: "[Unserializable]",
      },
    });
    expect(result.content[0]).toMatchObject({ type: "text" });
  });
});
