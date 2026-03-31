import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { OpenSearchAdapter } from "../src/index";

const OPENSEARCH_URL = process.env.SEARCHFN_OS_URL ?? "http://localhost:9201";

let testCounter = 0;

async function canConnect(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

describe("OpenSearchAdapter integration", () => {
  let available = false;
  let adapter: OpenSearchAdapter;

  beforeAll(async () => {
    available = await canConnect(OPENSEARCH_URL);
    if (!available) {
      console.warn("OpenSearch not available, skipping integration tests");
    }
  });

  beforeEach(async () => {
    if (!available) return;

    adapter = new OpenSearchAdapter({
      node: OPENSEARCH_URL,
      indexPrefix: `searchfn_os_test_${++testCounter}`,
      requestTimeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 25, maxDelayMs: 100 },
    });

    await adapter.initialize({
      resources: [
        { name: "docs", searchFields: ["title", "body"] },
        { name: "tickets", searchFields: ["summary"] },
      ],
    });
  });

  afterAll(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  it("indexes and searches using OpenSearch dialect", async () => {
    if (!available) return;

    await adapter.index({
      resource: "docs",
      documents: [{ id: "d1", fields: { title: "incident update", body: "resolved" } }],
    });

    const result = await adapter.search({ resource: "docs", query: "incident", limit: 5 });
    expect(result).toEqual(["d1"]);
  });

  it("supports field filtering and searchAll", async () => {
    if (!available) return;

    await adapter.index({
      resource: "docs",
      documents: [{ id: "d1", fields: { title: "incident", body: "postmortem" } }],
    });
    await adapter.index({
      resource: "tickets",
      documents: [{ id: "t1", fields: { summary: "incident" } }],
    });

    const filtered = await adapter.search({
      resource: "docs",
      query: "postmortem",
      fields: ["title"],
      limit: 10,
    });
    expect(filtered).toEqual([]);

    const searchAll = await adapter.searchAll({ query: "incident", limit: 10 });
    expect(searchAll.map((r) => String(r.id))).toContain("d1");
    expect(searchAll.map((r) => String(r.id))).toContain("t1");
  });

  it("remove and clear are idempotent", async () => {
    if (!available) return;

    await adapter.index({
      resource: "docs",
      documents: [{ id: "d1", fields: { title: "incident" } }],
    });

    await adapter.remove({ resource: "docs", ids: ["d1"] });
    await expect(adapter.remove({ resource: "docs", ids: ["d1"] })).resolves.toBeUndefined();

    await adapter.clear("docs");
    await expect(adapter.clear("docs")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// OpenSearch adapter unit tests for prefix support (ADP-004 / TV-CAP-001)
// ---------------------------------------------------------------------------

describe("OpenSearchAdapter prefix support", () => {
  // TV-CAP-001: capabilities.prefix is true (inherited from ElasticsearchAdapter)
  it("TV-CAP-001: capabilities.prefix is true", () => {
    const adapter = new OpenSearchAdapter({ node: "http://localhost:9201" });
    expect(adapter.capabilities?.prefix).toBe(true);
  });

  // ADP-004: OpenSearchAdapterOptions accepts defaults (inherited from ElasticsearchAdapterOptions)
  it("ADP-004: accepts defaults in constructor options without error", () => {
    expect(
      () =>
        new OpenSearchAdapter({
          node: "http://localhost:9201",
          defaults: { prefix: true, fuzzy: true, fieldBoosts: { title: 2 } },
        }),
    ).not.toThrow();
  });

  // ADP-004: prefix query structure is identical to Elasticsearch (inherited behaviour)
  it("ADP-004: prefix: true emits bool.should with phrase_prefix (via inheritance)", async () => {
    let capturedQuery: unknown;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string) as { query: unknown };
      capturedQuery = body.query;
      return new Response(
        JSON.stringify({ hits: { hits: [] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const adapter = new OpenSearchAdapter({
      node: "http://localhost:9201",
      retry: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
    });

    await adapter.search({ resource: "docs", query: "inc", prefix: true });
    fetchSpy.mockRestore();

    const q = capturedQuery as { bool: { should: unknown[]; minimum_should_match: number } };
    expect(q.bool.minimum_should_match).toBe(1);
    expect(q.bool.should).toHaveLength(2);
    expect(q.bool.should).toEqual(
      expect.arrayContaining([
        { multi_match: { query: "inc", fields: ["*"] } },
        { multi_match: { query: "inc", fields: ["*"], type: "phrase_prefix" } },
      ]),
    );
  });
});
