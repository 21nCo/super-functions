import { describe, expect, it } from "vitest";
import { InMemorySearchFn } from "../src/in-memory-search";

describe("Fuzzy Search Integration", () => {
  it("should match terms with typos using fuzzy search", () => {
    const search = new InMemorySearchFn({
      fields: ["title"],
      pipeline: {
        stopWords: []
      }
    });

    search.add({ id: "1", fields: { title: "anthropic" } });
    search.add({ id: "2", fields: { title: "anthropology" } });

    // Without fuzzy: typo doesn't match
    expect(search.search("anthopric")).toEqual([]);

    // With fuzzy: typo matches within edit distance
    const results = search.search("anthopric", { fuzzy: 2 });
    expect(results).toContain("1"); // "anthropic" is 2 edits away
  });

  it("should use default fuzzy distance of 2 when fuzzy=true", () => {
    const search = new InMemorySearchFn({
      fields: ["name"]
    });

    search.add({ id: "1", fields: { name: "hello world" } });

    const results = search.search("helo", { fuzzy: true });
    expect(results).toContain("1"); // "hello" matches "helo" (1 edit)
  });

  it("should rank exact matches higher than fuzzy matches", () => {
    const search = new InMemorySearchFn({
      fields: ["text"]
    });

    search.add({ id: "1", fields: { text: "test" } });
    search.add({ id: "2", fields: { text: "tests" } });
    search.add({ id: "3", fields: { text: "rest" } });

    const results = search.searchDetailed("test", { fuzzy: 1 });
    
    // Exact match should be present and rank well
    expect(results.length).toBeGreaterThan(0);
    expect(results.map(r => r.docId)).toContain("1");
  });

  it("should work with edge n-grams and fuzzy search together", () => {
    const search = new InMemorySearchFn({
      fields: ["name"],
      pipeline: {
        enableEdgeNGrams: true,
        edgeNGramMinLength: 2,
        edgeNGramMaxLength: 10,
        stopWords: []
      }
    });

    search.add({ id: "1", fields: { name: "anthropic" } });

    // Exact prefix match (no fuzzy needed)
    expect(search.search("anth")).toContain("1");
    
    // Fuzzy search should also work
    expect(search.search("anthropik", { fuzzy: 1 })).toContain("1");
  });

  it("should respect custom fuzzy distance", () => {
    const search = new InMemorySearchFn({
      fields: ["word"]
    });

    search.add({ id: "1", fields: { word: "kitten" } });
    search.add({ id: "2", fields: { word: "sitting" } });

    // "kitten" -> "sitting" = 3 edits
    expect(search.search("kitten", { fuzzy: 2 })).toEqual(["1"]); // Only exact
    expect(search.search("kitten", { fuzzy: 3 })).toHaveLength(2); // Both match
  });
});
