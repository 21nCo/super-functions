/**
 * Select token parsing tests
 * Tests TV-SEL-001 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { parseSelectToken } from "../src/select.js";

describe("parseSelectToken (TV-SEL-001)", () => {
  it('"*"', () => expect(parseSelectToken("*")).toEqual({ path: ["*"], baseName: "*", directive: undefined }));
  it('"title"', () => expect(parseSelectToken("title")).toEqual({ path: ["title"], baseName: "title", directive: undefined }));
  it('"tags.*"', () => expect(parseSelectToken("tags.*")).toEqual({ path: ["tags", "*"], baseName: "tags", directive: "*" }));
  it('"tags.#"', () => expect(parseSelectToken("tags.#")).toEqual({ path: ["tags", "#"], baseName: "tags", directive: "#" }));
  it('"children.**"', () => expect(parseSelectToken("children.**")).toEqual({ path: ["children", "**"], baseName: "children", directive: "**" }));
  it('"tags.*#"', () => expect(parseSelectToken("tags.*#")).toEqual({ path: ["tags", "*#"], baseName: "tags", directive: "*#" }));
  it('"parent.*"', () => expect(parseSelectToken("parent.*")).toEqual({ path: ["parent", "*"], baseName: "parent", directive: "*" }));
  it('"tasks.tags.*"', () => expect(parseSelectToken("tasks.tags.*")).toEqual({ path: ["tasks", "tags", "*"], baseName: "tasks", directive: "tags.*" }));
});
