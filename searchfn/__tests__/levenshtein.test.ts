import { describe, expect, it } from "vitest";
import { levenshteinDistance, fuzzyExpand } from "../src/utils/levenshtein";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("returns string length for empty string comparisons", () => {
    expect(levenshteinDistance("", "hello")).toBe(5);
    expect(levenshteinDistance("world", "")).toBe(5);
  });

  it("calculates single character operations", () => {
    expect(levenshteinDistance("cat", "hat")).toBe(1); // substitution
    expect(levenshteinDistance("cat", "cats")).toBe(1); // insertion
    expect(levenshteinDistance("cats", "cat")).toBe(1); // deletion
  });

  it("calculates multiple edit operations", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("saturday", "sunday")).toBe(3);
  });

  it("handles typo corrections", () => {
    expect(levenshteinDistance("anthropic", "anthopric")).toBe(2);
    expect(levenshteinDistance("openai", "opeani")).toBe(2); // delete 'a', add 'i'
  });

  it("is case-sensitive", () => {
    expect(levenshteinDistance("Hello", "hello")).toBe(1);
  });
});

describe("fuzzyExpand", () => {
  it("returns exact match when present in vocabulary", () => {
    const vocabulary = new Set(["hello", "world", "test"]);
    const results = fuzzyExpand("hello", 2, vocabulary);
    expect(results).toContain("hello");
  });

  it("returns terms within edit distance", () => {
    const vocabulary = new Set(["cat", "hat", "bat", "mat", "rat"]);
    const results = fuzzyExpand("cat", 1, vocabulary);
    
    expect(results).toContain("cat"); // exact
    expect(results).toContain("hat"); // 1 edit
    expect(results).toContain("bat"); // 1 edit
    expect(results).toContain("mat"); // 1 edit
    expect(results).toContain("rat"); // 1 edit
  });

  it("excludes terms beyond edit distance", () => {
    const vocabulary = new Set(["hello", "world", "test"]);
    const results = fuzzyExpand("hello", 1, vocabulary);
    
    expect(results).toContain("hello");
    expect(results).not.toContain("world"); // 4 edits
    expect(results).not.toContain("test"); // 5 edits
  });

  it("handles typo correction scenarios", () => {
    const vocabulary = new Set(["anthropic", "anthropology", "antenna"]);
    const results = fuzzyExpand("anthopric", 2, vocabulary);
    
    expect(results).toContain("anthropic"); // 2 edits (swap + missing h)
  });

  it("filters by length difference optimization", () => {
    const vocabulary = new Set(["a", "ab", "abc", "abcd", "abcde", "abcdef"]);
    const results = fuzzyExpand("abc", 1, vocabulary);
    
    // Only terms with length difference <= 1 should be considered
    expect(results).toContain("ab");   // length 2
    expect(results).toContain("abc");  // length 3
    expect(results).toContain("abcd"); // length 4
    expect(results).not.toContain("a"); // length 1 (diff=2)
    expect(results).not.toContain("abcde"); // length 5 (diff=2)
  });

  it("returns empty array for no matches", () => {
    const vocabulary = new Set(["completely", "different", "words"]);
    const results = fuzzyExpand("xyz", 1, vocabulary);
    expect(results).toEqual([]);
  });

  it("is case-insensitive for query term", () => {
    const vocabulary = new Set(["hello"]);
    const results = fuzzyExpand("HELLO", 0, vocabulary);
    expect(results).toContain("hello");
  });
});
