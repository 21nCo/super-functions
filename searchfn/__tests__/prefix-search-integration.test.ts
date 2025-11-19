import { describe, expect, it } from "vitest";
import { InMemorySearchFn } from "../src/in-memory-search";

describe("Prefix Search Integration", () => {
  it("should match prefixes with edge n-grams enabled", () => {
    const search = new InMemorySearchFn({
      fields: ["title", "body"],
      pipeline: {
        enableEdgeNGrams: true,
        edgeNGramMinLength: 2,
        edgeNGramMaxLength: 15,
        stopWords: [] // Disable stop words for this test
      }
    });

    search.add({
      id: "1",
      fields: {
        title: "Anthropic Claude AI",
        body: "Advanced artificial intelligence"
      }
    });

    search.add({
      id: "2",
      fields: {
        title: "Ancient history",
        body: "Study of past civilizations"
      }
    });

    // Prefix "an" should match both "anthropic" and "ancient"
    const results = search.search("an");
    expect(results).toHaveLength(2);
    expect(results).toContain("1");
    expect(results).toContain("2");
  });

  it("should rank exact matches higher than prefix matches", () => {
    const search = new InMemorySearchFn({
      fields: ["title"],
      pipeline: {
        enableEdgeNGrams: true,
        edgeNGramMinLength: 2,
        edgeNGramMaxLength: 15
      }
    });

    search.add({
      id: "1",
      fields: { title: "test document" }
    });

    search.add({
      id: "2",
      fields: { title: "testing documentation" }
    });

    // Searching for "test" should rank exact match higher
    const results = search.searchDetailed("test");
    expect(results[0].docId).toBe("1");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("should support autocomplete-style searches", () => {
    const search = new InMemorySearchFn({
      fields: ["name"],
      pipeline: {
        enableEdgeNGrams: true,
        edgeNGramMinLength: 2,
        edgeNGramMaxLength: 10,
        stopWords: [] // Disable stop words for this test
      }
    });

    const companies = [
      { id: "1", fields: { name: "Anthropic" } },
      { id: "2", fields: { name: "OpenAI" } },
      { id: "3", fields: { name: "Google" } },
      { id: "4", fields: { name: "Microsoft" } }
    ];

    companies.forEach((company) => search.add(company));

    // Progressive typing simulation
    expect(search.search("an")).toContain("1"); // "an" matches Anthropic
    expect(search.search("ant")).toContain("1"); // "ant" matches Anthropic
    expect(search.search("anth")).toContain("1"); // "anth" matches Anthropic
    expect(search.search("anthropic")).toContain("1"); // Full match

    // Different prefix
    expect(search.search("op")).toContain("2"); // "op" matches OpenAI
    expect(search.search("openai")).toContain("2"); // Full match
  });

  it("works without edge n-grams for exact matching", () => {
    const search = new InMemorySearchFn({
      fields: ["title"],
      pipeline: {
        enableEdgeNGrams: false
      }
    });

    search.add({
      id: "1",
      fields: { title: "anthropic" }
    });

    // Without n-grams, prefix shouldn't match
    expect(search.search("anth")).toEqual([]);

    // But exact term should match
    expect(search.search("anthropic")).toContain("1");
  });
});
