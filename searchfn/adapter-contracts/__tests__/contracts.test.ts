import { describe, expect, it } from "vitest";
import { SEARCH_ADAPTER_DISPOSED, SearchAdapterError } from "../src/index";

describe("adapter contracts scaffolding", () => {
  it("exports constants and errors", () => {
    expect(SEARCH_ADAPTER_DISPOSED).toBe("SEARCH_ADAPTER_DISPOSED");
    const err = new SearchAdapterError("X", "msg");
    expect(err.code).toBe("X");
  });
});
