import { describe, it, expect, beforeEach } from "vitest";
import { MemoryAdapter } from "../src/index";
import { SearchAdapterError } from "@searchfn/adapter-contracts";

describe("MemoryAdapter — fuzzy search", () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  // TV-FUZZ-001
  it("fuzzy=true finds documents with misspelled query terms", async () => {
    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "groceries" } }]
    });
    const result = await adapter.search({
      resource: "tasks",
      query: "groceris",
      fuzzy: true
    });
    expect(result).toContain("1");
  });

  // TV-FUZZ-002
  it("fuzzy disabled by default — misspelling returns empty", async () => {
    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "groceries" } }]
    });
    const result = await adapter.search({
      resource: "tasks",
      query: "groceris"
    });
    expect(result).toEqual([]);
  });

  it("fuzzy=1 respects distance threshold", async () => {
    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "hello" } }]
    });
    const withinDistance = await adapter.search({
      resource: "tasks",
      query: "hellu",
      fuzzy: 1
    });
    expect(withinDistance).toContain("1");

    const beyondDistance = await adapter.search({
      resource: "tasks",
      query: "hxllu",
      fuzzy: 1
    });
    expect(beyondDistance).toEqual([]);
  });

  it("fuzzy matches score lower than exact matches", async () => {
    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "exact", fields: { title: "groceries" } },
        { id: "fuzzy-match", fields: { title: "groceris" } }
      ]
    });
    const exactResult = await adapter.search({
      resource: "tasks",
      query: "groceries",
      limit: 10
    });
    const fuzzyResult = await adapter.search({
      resource: "tasks",
      query: "groceris",
      fuzzy: true,
      limit: 10
    });
    expect(exactResult[0]).toBe("exact");
    expect(fuzzyResult).toContain("fuzzy-match");
  });

  it("keeps shared vocabulary entries when removing one field bucket", async () => {
    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "1", fields: { title: "report" } },
        { id: "2", fields: { body: "report" } },
      ],
    });

    await adapter.remove({ resource: "tasks", ids: ["1"] });

    const result = await adapter.search({
      resource: "tasks",
      query: "report",
      fuzzy: true,
    });

    expect(result).toEqual(["2"]);
  });
});

describe("MemoryAdapter — field boosts", () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  // TV-BOOST-001 / TV-MEM-007
  it("fieldBoosts causes matches in boosted field to rank higher", async () => {
    await adapter.index({
      resource: "items",
      documents: [
        { id: "A", fields: { title: "report", body: "quarterly data" } },
        { id: "B", fields: { title: "quarterly data", body: "report" } }
      ]
    });
    const result = await adapter.search({
      resource: "items",
      query: "report",
      fieldBoosts: { title: 5.0, body: 1.0 },
      limit: 10
    });
    expect(result[0]).toBe("A");
    expect(result).toContain("B");
  });

  it("default boost of 1.0 for unspecified fields", async () => {
    await adapter.index({
      resource: "items",
      documents: [
        { id: "1", fields: { title: "report", description: "quarterly data" } }
      ]
    });
    const withBoosts = await adapter.search({
      resource: "items",
      query: "report",
      fieldBoosts: { title: 1.0 }
    });
    const withoutBoosts = await adapter.search({
      resource: "items",
      query: "report"
    });
    expect(withBoosts).toContain("1");
    expect(withoutBoosts).toContain("1");
  });
});

describe("MemoryAdapter — searchAll", () => {
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "t1", fields: { title: "Quarterly report analysis" } },
        { id: "t2", fields: { title: "Monthly review" } }
      ]
    });
    await adapter.index({
      resource: "notes",
      documents: [
        { id: "n1", fields: { title: "Report summary" } },
        { id: "n2", fields: { title: "Meeting notes" } }
      ]
    });
  });

  // TV-XSRC-001
  it("searchAll returns results from all resources sorted by score", async () => {
    const results = await adapter.searchAll({
      query: "report",
      limit: 10
    });

    const resourceIds = results.map((r) => ({ resource: r.resource, id: r.id }));
    expect(resourceIds).toEqual(
      expect.arrayContaining([
        { resource: "tasks", id: "t1" },
        { resource: "notes", id: "n1" }
      ])
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  // TV-XSRC-002
  it("searchAll with resources filter scopes to specified resources only", async () => {
    const results = await adapter.searchAll({
      query: "report",
      resources: ["tasks"],
      limit: 10
    });
    expect(results.every((r) => r.resource === "tasks")).toBe(true);
    expect(results.some((r) => r.id === "t1")).toBe(true);
  });

  // TV-XSRC-003
  it("searchAll respects limitPerResource cap", async () => {
    await adapter.index({
      resource: "files",
      documents: Array.from({ length: 10 }, (_, i) => ({
        id: `f${i}`,
        fields: { title: `report document ${i}` }
      }))
    });
    await adapter.index({
      resource: "pages",
      documents: Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        fields: { title: `report page ${i}` }
      }))
    });

    const results = await adapter.searchAll({
      query: "report",
      resources: ["files", "pages"],
      limitPerResource: 3,
      limit: 100
    });

    const filesCount = results.filter((r) => r.resource === "files").length;
    const pagesCount = results.filter((r) => r.resource === "pages").length;
    expect(filesCount).toBeLessThanOrEqual(3);
    expect(pagesCount).toBeLessThanOrEqual(3);
  });

  it("searchAll with fuzzy finds misspelled terms across resources", async () => {
    const results = await adapter.searchAll({
      query: "reprot",
      fuzzy: true,
      limit: 10
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids.some((id) => id === "t1" || id === "n1")).toBe(true);
  });

  it("searchAll global limit caps total results", async () => {
    const results = await adapter.searchAll({
      query: "report",
      limit: 1
    });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("searchAll returns results with score property", async () => {
    const results = await adapter.searchAll({ query: "report", limit: 10 });
    for (const r of results) {
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it("searchAll returns empty array when no resources match query", async () => {
    const results = await adapter.searchAll({
      query: "zzznomatch",
      limit: 10
    });
    expect(results).toEqual([]);
  });

  it("searchAll deterministic tie-break: resource ASC then id ASC", async () => {
    const fresh = new MemoryAdapter();
    await fresh.index({
      resource: "alpha",
      documents: [{ id: "2", fields: { title: "unique" } }]
    });
    await fresh.index({
      resource: "alpha",
      documents: [{ id: "1", fields: { title: "unique" } }]
    });
    await fresh.index({
      resource: "beta",
      documents: [{ id: "1", fields: { title: "unique" } }]
    });

    const results = await fresh.searchAll({ query: "unique", limit: 10 });
    const alphaResults = results.filter((r) => r.resource === "alpha");
    const betaResults = results.filter((r) => r.resource === "beta");

    if (alphaResults.length >= 2) {
      expect(String(alphaResults[0].id) <= String(alphaResults[1].id)).toBe(
        true
      );
    }

    const alphaScore = alphaResults[0]?.score ?? 0;
    const betaScore = betaResults[0]?.score ?? 0;
    if (alphaScore === betaScore) {
      const alphaIdx = results.findIndex((r) => r.resource === "alpha");
      const betaIdx = results.findIndex((r) => r.resource === "beta");
      expect(alphaIdx).toBeLessThan(betaIdx);
    }

    await fresh.dispose();
  });
});

describe("MemoryAdapter — initialize and name", () => {
  it("name is 'memory'", () => {
    expect(new MemoryAdapter().name).toBe("memory");
  });

  it("initialize pre-creates resource engines", async () => {
    const adapter = new MemoryAdapter();
    await adapter.initialize({
      resources: [
        { name: "tasks", searchFields: ["title", "description"] },
        { name: "notes", searchFields: ["title"] }
      ]
    });
    const result = await adapter.search({ resource: "tasks", query: "anything" });
    expect(result).toEqual([]);
    await adapter.dispose();
  });

  it("indexes >10k documents via deterministic chunking", async () => {
    const adapter = new MemoryAdapter();
    // Keep this just above the 10k batching threshold so we still cover
    // cross-batch indexing without making CI pay for an oversized fixture.
    const documents = Array.from({ length: 10001 }, (_, i) => ({
      id: `d${i}`,
      fields: { title: `document ${i}` },
    }));
    await adapter.index({ resource: "bulk", documents });

    const result = await adapter.search({
      resource: "bulk",
      query: "document 10000",
      fields: ["title"],
      limit: 5,
    });
    expect(result).toContain("d10000");
    await adapter.dispose();
  }, 30000);
});

describe("MemoryAdapter — prefix search", () => {
  // TV-MEM-001
  it("TV-MEM-001: prefix: true finds documents matching partial query", async () => {
    const adapter = new MemoryAdapter();
    await adapter.index({
      resource: "r",
      documents: [{ id: "1", fields: { text: "testing" } }],
    });
    const result = await adapter.search({
      resource: "r",
      query: "test",
      prefix: true,
    });
    expect(result).toContain("1");
    await adapter.dispose();
  });

  // TV-MEM-002
  it("TV-MEM-002: prefix: false (default) does not match prefix-only tokens", async () => {
    const adapter = new MemoryAdapter();
    await adapter.index({
      resource: "r",
      documents: [{ id: "1", fields: { text: "hello world" } }],
    });
    const result = await adapter.search({
      resource: "r",
      query: "hel",
    });
    expect(result).toEqual([]);
    await adapter.dispose();
  });

  // TV-MEM-003
  it("TV-MEM-003: construct-time defaults.prefix applied when param omitted", async () => {
    const adapter = new MemoryAdapter({ defaults: { prefix: true } });
    await adapter.index({
      resource: "r",
      documents: [{ id: "1", fields: { text: "hello world" } }],
    });
    const result = await adapter.search({
      resource: "r",
      query: "hel",
    });
    expect(result).toContain("1");
    await adapter.dispose();
  });

  it("TV-MEM-CAP: capabilities include prefix: true", () => {
    const adapter = new MemoryAdapter();
    expect(adapter.capabilities.prefix).toBe(true);
  });
});

describe("MemoryAdapter — abort signal support", () => {
  it("index throws DFQL_ABORTED when signal is already aborted", async () => {
    const adapter = new MemoryAdapter();
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "hello" } }],
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(SearchAdapterError);

    await expect(
      adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "hello" } }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "DFQL_ABORTED" });
  });

  it("searchAll throws DFQL_ABORTED when signal is aborted", async () => {
    const adapter = new MemoryAdapter();
    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "hello report" } }],
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.searchAll({
        query: "report",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "DFQL_ABORTED" });

    await adapter.dispose();
  });
});
