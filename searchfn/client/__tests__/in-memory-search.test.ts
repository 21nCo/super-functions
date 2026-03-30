import { describe, expect, it } from "vitest";
import { InMemorySearchFn } from "../src/in-memory-search";

describe("InMemorySearchFn", () => {
  it("adds, searches, snapshots, and restores documents", () => {
    const search = new InMemorySearchFn({
      fields: ["title", "body"],
      pipeline: {
        enableEdgeNGrams: true,
        edgeNGramMinLength: 2,
      },
    });

    search.add({
      id: "doc-1",
      fields: {
        title: "Search Docs",
        body: "Route scope overrides",
      },
      store: {
        path: "/docs/search",
      },
    });

    const results = search.searchDetailed("search", { includeStored: true });
    expect(results[0]?.docId).toBe("doc-1");
    expect(results[0]?.document).toEqual({ path: "/docs/search" });

    const snapshot = search.exportSnapshot();
    const restored = new InMemorySearchFn({
      fields: ["title", "body"],
      pipeline: {
        enableEdgeNGrams: true,
        edgeNGramMinLength: 2,
      },
    });
    restored.importSnapshot(snapshot);

    expect(restored.search("route")).toEqual(["doc-1"]);
  });

  it("removes and clears documents deterministically", () => {
    const search = new InMemorySearchFn({
      fields: ["title"],
    });

    search.add({
      id: "doc-1",
      fields: { title: "Alpha" },
    });
    search.add({
      id: "doc-2",
      fields: { title: "Alphabet" },
    });

    search.remove("doc-1");
    expect(search.search("alphabet")).toEqual(["doc-2"]);

    search.clear();
    expect(search.search("alphabet")).toEqual([]);
  });

  it("replaces prior postings when re-indexing an existing document id", () => {
    const search = new InMemorySearchFn({
      fields: ["title", "body"],
    });

    search.add({
      id: "doc-1",
      fields: {
        title: "Alpha",
        body: "alpha term only",
      },
    });

    search.add({
      id: "doc-1",
      fields: {
        title: "Beta",
        body: "beta term only",
      },
    });

    expect(search.search("alpha")).toEqual([]);
    expect(search.search("beta")).toEqual(["doc-1"]);
  });

  it("keeps numeric and string document ids distinct", () => {
    const search = new InMemorySearchFn({
      fields: ["title"],
    });

    search.add({
      id: 1,
      fields: { title: "shared numeric" },
      store: { kind: "number" },
    });
    search.add({
      id: "1",
      fields: { title: "shared string" },
      store: { kind: "string" },
    });

    const results = search.searchDetailed("shared", { includeStored: true, limit: 10 });
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.docId)).toEqual([1, "1"]);
  });

  it("supports limit zero without returning a default result", () => {
    const search = new InMemorySearchFn({
      fields: ["title"],
    });

    search.add({
      id: "doc-1",
      fields: { title: "Alpha" },
    });

    expect(search.searchDetailed("alpha", { limit: 0 })).toEqual([]);
  });
});
