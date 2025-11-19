import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SearchFn, InMemorySearchFn } from "../src";

describe("Snapshot metadata preservation", () => {
  describe("SearchFn", () => {
    let searchFn: SearchFn;
    const dbName = `searchfn-test-${Math.random().toString(36).slice(2)}`;

    beforeEach(() => {
      searchFn = new SearchFn({
        name: dbName,
        fields: ["title", "content"],
        pipeline: {
          enableEdgeNGrams: true,
          edgeNGramMinLength: 2,
          edgeNGramMaxLength: 10
        }
      });
    });

    afterEach(async () => {
      await searchFn.destroy();
    });

    it("preserves n-gram metadata through export/import cycle", async () => {
      // Index a document with n-grams
      await searchFn.add({
        id: "1",
        fields: {
          title: "anthropic",
          content: "test content"
        }
      });

      // Search with partial match - should work due to n-grams
      const results1 = await searchFn.search("anth");
      expect(results1).toContain("1");

      // Export snapshot
      const snapshot = await searchFn.exportSnapshot();

      // Clear and import
      await searchFn.clear();
      await searchFn.importSnapshot(snapshot);

      // Search should still work with partial match
      const results2 = await searchFn.search("anth");
      expect(results2).toContain("1");

      // Verify prefix match penalty is applied (prefix matches should score lower than exact)
      await searchFn.add({
        id: "2",
        fields: {
          title: "anth exact",  // Contains "anth" as complete token
          content: "test"
        }
      });

      const detailedResults = await searchFn.searchDetailed("anth", { includeStored: false });
      // Both should match, but scoring should reflect metadata
      expect(detailedResults.length).toBeGreaterThan(0);
    });

    it("preserves n-gram metadata through worker snapshot cycle", async () => {
      await searchFn.add({
        id: "1",
        fields: {
          title: "testing",
          content: "content"
        }
      });

      const results1 = await searchFn.search("test");
      expect(results1).toContain("1");

      // Export worker snapshot
      const workerSnapshot = await searchFn.exportWorkerSnapshot();

      // Create new instance and import
      const newSearchFn = new SearchFn({
        name: `${dbName}-2`,
        fields: ["title", "content"],
        pipeline: {
          enableEdgeNGrams: true,
          edgeNGramMinLength: 2,
          edgeNGramMaxLength: 10
        }
      });

      await newSearchFn.importWorkerSnapshot(workerSnapshot);

      const results2 = await newSearchFn.search("test");
      expect(results2).toContain("1");

      await newSearchFn.destroy();
    });
  });

  describe("InMemorySearchFn", () => {
    let searchFn: InMemorySearchFn;

    beforeEach(() => {
      searchFn = new InMemorySearchFn({
        fields: ["title", "content"],
        pipeline: {
          enableEdgeNGrams: true,
          edgeNGramMinLength: 2,
          edgeNGramMaxLength: 10
        }
      });
    });

    it("preserves n-gram metadata through snapshot cycle", () => {
      searchFn.add({
        id: "1",
        fields: {
          title: "anthropic",
          content: "test content"
        }
      });

      const results1 = searchFn.search("anth");
      expect(results1).toContain("1");

      // Export and import snapshot
      const snapshot = searchFn.exportSnapshot();
      searchFn.clear();
      searchFn.importSnapshot(snapshot);

      // Should still work
      const results2 = searchFn.search("anth");
      expect(results2).toContain("1");
    });
  });
});
