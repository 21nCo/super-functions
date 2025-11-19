import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySearchFn } from "../src/in-memory-search";

describe("InMemorySearchFn", () => {
  let searchFn: InMemorySearchFn;

  beforeEach(() => {
    searchFn = new InMemorySearchFn({
      fields: ["title", "body"]
    });
  });

  describe("basic operations", () => {
    it("should add and retrieve documents", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Hello World", body: "This is a test" },
        store: { custom: "data" }
      });

      const doc = searchFn.getDocument("1");
      expect(doc).toEqual({ custom: "data" });
    });

    it("should search indexed documents", () => {
      searchFn.add({
        id: "1",
        fields: { title: "JavaScript Tutorial", body: "Learn JavaScript" }
      });
      searchFn.add({
        id: "2",
        fields: { title: "Python Guide", body: "Learn Python programming" }
      });

      const results = searchFn.search("JavaScript");
      expect(results).toContain("1");
      expect(results).not.toContain("2");
    });

    it("should return empty results for non-matching queries", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Hello", body: "World" }
      });

      const results = searchFn.search("nonexistent");
      expect(results).toEqual([]);
    });

    it("should remove documents", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Test", body: "Document" },
        store: { foo: "bar" }
      });

      expect(searchFn.getDocument("1")).toBeDefined();

      searchFn.remove("1");

      expect(searchFn.getDocument("1")).toBeUndefined();
      const results = searchFn.search("Test");
      expect(results).toEqual([]);
    });

    it("should clear all data", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Test", body: "One" }
      });
      searchFn.add({
        id: "2",
        fields: { title: "Test", body: "Two" }
      });

      searchFn.clear();

      expect(searchFn.search("Test")).toEqual([]);
      expect(searchFn.getDocument("1")).toBeUndefined();
      expect(searchFn.getDocument("2")).toBeUndefined();
    });
  });

  describe("searchDetailed", () => {
    it("should return results with scores", () => {
      searchFn.add({
        id: "1",
        fields: { title: "JavaScript", body: "programming" }
      });

      const results = searchFn.searchDetailed("JavaScript");
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        docId: "1",
        score: expect.any(Number)
      });
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("should include stored documents when requested", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Test", body: "Document" },
        store: { custom: "metadata", tags: ["test"] }
      });

      const results = searchFn.searchDetailed("Test", { includeStored: true });
      expect(results).toHaveLength(1);
      expect(results[0].document).toEqual({
        custom: "metadata",
        tags: ["test"]
      });
    });

    it("should not include stored documents by default", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Test", body: "Document" },
        store: { custom: "metadata" }
      });

      const results = searchFn.searchDetailed("Test");
      expect(results[0].document).toBeUndefined();
    });

    it("should rank documents by relevance", () => {
      searchFn.add({
        id: "1",
        fields: { title: "JavaScript", body: "A brief mention" }
      });
      searchFn.add({
        id: "2",
        fields: { title: "JavaScript Programming", body: "JavaScript is great for JavaScript development" }
      });

      const results = searchFn.searchDetailed("JavaScript");
      expect(results).toHaveLength(2);
      // Document 2 should rank higher due to more occurrences
      expect(results[0].docId).toBe("2");
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });

  describe("search options", () => {
    beforeEach(() => {
      searchFn.add({ id: "1", fields: { title: "Test One", body: "Content" } });
      searchFn.add({ id: "2", fields: { title: "Test Two", body: "Content" } });
      searchFn.add({ id: "3", fields: { title: "Test Three", body: "Content" } });
    });

    it("should respect limit option", () => {
      const results = searchFn.search("Test", { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it("should search specific fields", () => {
      searchFn.add({
        id: "4",
        fields: { title: "Unique Title", body: "Generic content" }
      });

      const titleResults = searchFn.search("Unique", { fields: ["title"] });
      expect(titleResults).toContain("4");

      const bodyResults = searchFn.search("Unique", { fields: ["body"] });
      expect(bodyResults).toEqual([]);
    });
  });

  describe("snapshot import/export", () => {
    it("should export and import snapshot", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Test", body: "Document" },
        store: { meta: "data" }
      });
      searchFn.add({
        id: "2",
        fields: { title: "Another", body: "Test" }
      });

      const snapshot = searchFn.exportSnapshot();

      const newSearchFn = new InMemorySearchFn({
        fields: ["title", "body"]
      });
      newSearchFn.importSnapshot(snapshot);

      expect(newSearchFn.search("Test")).toEqual(searchFn.search("Test"));
      expect(newSearchFn.getDocument("1")).toEqual({ meta: "data" });
    });

    it("should preserve search functionality after import", () => {
      searchFn.add({
        id: "1",
        fields: { title: "JavaScript", body: "Programming" }
      });

      const snapshot = searchFn.exportSnapshot();
      const newSearchFn = new InMemorySearchFn({
        fields: ["title", "body"]
      });
      newSearchFn.importSnapshot(snapshot);

      const results = newSearchFn.searchDetailed("JavaScript");
      expect(results).toHaveLength(1);
      expect(results[0].docId).toBe("1");
    });
  });

  describe("edge cases", () => {
    it("should handle documents with empty fields", () => {
      searchFn.add({
        id: "1",
        fields: { title: "", body: "" }
      });

      const results = searchFn.search("anything");
      expect(results).toEqual([]);
    });

    it("should handle documents without stored data", () => {
      searchFn.add({
        id: "1",
        fields: { title: "Test", body: "Document" }
      });

      expect(searchFn.getDocument("1")).toBeUndefined();
    });

    it("should handle numeric document IDs", () => {
      searchFn.add({
        id: 123,
        fields: { title: "Test", body: "Document" }
      });

      const results = searchFn.search("Test");
      expect(results).toContain("123");
    });

    it("should handle multiple adds of same document", () => {
      searchFn.add({
        id: "1",
        fields: { title: "First", body: "Version" },
        store: { version: 1 }
      });
      searchFn.add({
        id: "1",
        fields: { title: "Second", body: "Version" },
        store: { version: 2 }
      });

      expect(searchFn.getDocument("1")).toEqual({ version: 2 });
      expect(searchFn.search("First")).toContain("1");
      expect(searchFn.search("Second")).toContain("1");
    });
  });

  describe("with custom pipeline", () => {
    it("should respect custom pipeline options", () => {
      const customSearchFn = new InMemorySearchFn({
        fields: ["title"],
        pipeline: {
          stopWords: ["the", "a"],
          enableStemming: true
        }
      });

      customSearchFn.add({
        id: "1",
        fields: { title: "The running runner" }
      });

      // Stemming should match "running" with "run"
      const results = customSearchFn.search("run");
      expect(results).toContain("1");
    });
  });
});
