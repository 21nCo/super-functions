/**
 * Tests for ns() composable namespace helper
 * Test vectors: TV-NS-001, TV-NS-002, TV-NS-003, TV-NS-039
 */

import { describe, it, expect } from "vitest";
import { ns } from "../src/ns.js";

describe("ns()", () => {
  // TV-NS-001: two segments
  it("TV-NS-001: joins two segments with colon", () => {
    expect(ns("org-acme", "user-123")).toBe("org-acme:user-123");
  });

  // TV-NS-002: single segment
  it("TV-NS-002: returns single segment as-is (no trailing colon)", () => {
    expect(ns("user-1")).toBe("user-1");
  });

  // TV-NS-003: empty segments filtered
  it("TV-NS-003: filters out empty segments", () => {
    expect(ns("org", "", "user")).toBe("org:user");
  });

  it("joins three segments", () => {
    expect(ns("org", "project", "user")).toBe("org:project:user");
  });

  // TV-NS-003 negative variant: all empty throws
  it("TV-NS-003 negative: throws when all segments are empty", () => {
    expect(() => ns("", "")).toThrow("at least one non-empty segment");
  });

  // TV-NS-039: ns() with no args throws
  it("TV-NS-039: throws when called with no arguments", () => {
    expect(() => ns()).toThrow("at least one non-empty segment");
  });

  it("is pure and deterministic", () => {
    const a = ns("org", "user");
    const b = ns("org", "user");
    expect(a).toBe(b);
    expect(a).toBe("org:user");
  });

  it("does not escape colons within segments", () => {
    expect(ns("org:sub", "user")).toBe("org:sub:user");
  });
});
