import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { ElasticsearchAdapter } from "../src/index";
import { SearchAdapterError } from "@searchfn/adapter-contracts";
import { redactSensitive as redactElasticSensitive } from "../src/internal/redaction";

const ES_URL = process.env.SEARCHFN_ES_URL ?? "http://localhost:9200";

let testCounter = 0;

async function canConnect(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

describe("ElasticsearchAdapter integration", () => {
  let available = false;
  let adapter: ElasticsearchAdapter;

  beforeAll(async () => {
    available = await canConnect(ES_URL);
    if (!available) {
      console.warn("Elasticsearch not available, skipping integration tests");
    }
  });

  beforeEach(async () => {
    if (!available) return;

    adapter = new ElasticsearchAdapter({
      node: ES_URL,
      engine: "elasticsearch",
      indexPrefix: `searchfn_es_test_${++testCounter}`,
      requestTimeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 25, maxDelayMs: 100 },
    });

    await adapter.initialize({
      resources: [
        { name: "tasks", searchFields: ["title", "body"] },
        { name: "notes", searchFields: ["content"] },
      ],
    });
  });

  afterEach(async () => {
    await adapter?.dispose();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  it("supports index/search/remove/clear with deterministic ordering", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "b", fields: { title: "incident report", body: "urgent" } },
        { id: "a", fields: { title: "incident report", body: "urgent" } },
      ],
    });

    const first = await adapter.search({ resource: "tasks", query: "incident", limit: 10 });
    const second = await adapter.search({ resource: "tasks", query: "incident", limit: 10 });
    expect(first).toEqual(second);
    expect(first).toEqual(["a", "b"]);

    await adapter.remove({ resource: "tasks", ids: ["a"] });
    const afterRemove = await adapter.search({ resource: "tasks", query: "incident", limit: 10 });
    expect(afterRemove).toEqual(["b"]);

    await adapter.clear("tasks");
    const afterClear = await adapter.search({ resource: "tasks", query: "incident", limit: 10 });
    expect(afterClear).toEqual([]);
  });

  it("supports searchAll with canonical global ordering", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "2", fields: { title: "incident" } }],
    });

    await adapter.index({
      resource: "notes",
      documents: [{ id: "1", fields: { content: "incident" } }],
    });

    const results = await adapter.searchAll({ query: "incident", limit: 10 });
    expect(results.length).toBeGreaterThan(0);

    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      const valid =
        prev.score > curr.score ||
        (prev.score === curr.score && prev.resource < curr.resource) ||
        (prev.score === curr.score &&
          prev.resource === curr.resource &&
          String(prev.id) <= String(curr.id));
      expect(valid).toBe(true);
    }
  });

  // TV-ES-001: prefix: true matches partial terms (requires live ES)
  it("TV-ES-001: prefix: true returns partial term matches, prefix: false does not", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "todo item" } }],
    });

    const withPrefix = await adapter.search({ resource: "tasks", query: "tod", prefix: true, limit: 10 });
    expect(withPrefix).toContain("1");

    const withoutPrefix = await adapter.search({ resource: "tasks", query: "tod", prefix: false, limit: 10 });
    expect(withoutPrefix).not.toContain("1");
  });
});

describe("ElasticsearchAdapter resilience and validation", () => {
  it("redacts plain connection keys without over-redacting connectionTimeout", () => {
    expect(
      redactElasticSensitive({
        connection: "http://user:pass@example.test",
        connectionTimeout: 5000,
      }),
    ).toEqual({
      connection: "[REDACTED]",
      connectionTimeout: 5000,
    });
  });

  it("fails unsupported dialect with DFQL_UNSUPPORTED", () => {
    expect(
      () => new ElasticsearchAdapter({ node: "http://localhost:9200", engine: "invalid" as never }),
    ).toThrowError(SearchAdapterError);

    try {
      new ElasticsearchAdapter({ node: "http://localhost:9200", engine: "invalid" as never });
      expect.fail("should throw");
    } catch (err) {
      expect((err as SearchAdapterError).code).toBe("DFQL_UNSUPPORTED");
      expect((err as Error).message).toContain("Unsupported elastic dialect");
    }
  });

  it("enforces bounded retry budget", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response("{}", {
            status: 503,
            headers: { "content-type": "application/json" },
          }),
      );

    const adapter = new ElasticsearchAdapter({
      node: "http://localhost:9200",
      engine: "elasticsearch",
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 },
      requestTimeoutMs: 100,
    });

    try {
      await adapter.search({ resource: "tasks", query: "incident", limit: 5 });
      expect.fail("expected retry exhaustion");
    } catch (err) {
      expect((err as SearchAdapterError).code).toBe("INTERNAL");
      expect((err as Error).message).toContain("Retry budget exhausted");
    }

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("preserves digit-only ids as strings in search results", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      makeHitsResponse([{ _id: "00123" }, { _id: "9007199254740993" }]),
    );

    try {
      const adapter = new ElasticsearchAdapter({
        node: "http://localhost:9200",
        engine: "elasticsearch",
      });

      const results = await adapter.search({ resource: "tasks", query: "incident", limit: 10 });
      expect(results).toEqual(["00123", "9007199254740993"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("preserves canonical safe integers as numbers in search results", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      makeHitsResponse([{ _id: "123" }, { _id: "0" }]),
    );

    try {
      const adapter = new ElasticsearchAdapter({
        node: "http://localhost:9200",
        engine: "elasticsearch",
      });

      const results = await adapter.search({ resource: "tasks", query: "incident", limit: 10 });
      expect(results).toEqual([123, 0]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("requests filtered bulk error payloads for write operations", async () => {
    const urls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      urls.push(String(url));
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ errors: false, items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const adapter = new ElasticsearchAdapter({
      node: "http://localhost:9200",
      engine: "elasticsearch",
    });

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "a", fields: { title: "incident" } }],
    });
    await adapter.remove({
      resource: "tasks",
      ids: ["a"],
    });

    expect(urls).toContain(
      "http://localhost:9200/_bulk?refresh=wait_for&filter_path=errors,items.*._id,items.*._index,items.*.status,items.*.error",
    );
    expect(
      urls.filter((url) =>
        url === "http://localhost:9200/_bulk?refresh=wait_for&filter_path=errors,items.*._id,items.*._index,items.*.status,items.*.error",
      ),
    ).toHaveLength(2);

    fetchSpy.mockRestore();
  });

  it("preserves configured base paths when building backend URLs", async () => {
    const urls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      urls.push(String(url));
      return makeHitsResponse([{ _id: "123" }]);
    });

    try {
      const adapter = new ElasticsearchAdapter({
        node: "http://localhost:9200/custom-base",
        engine: "elasticsearch",
      });

      await adapter.search({ resource: "tasks", query: "incident", limit: 10 });
      expect(urls[0]).toBe("http://localhost:9200/custom-base/searchfn_tasks/_search");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Query construction unit tests (TV-ES-002 through TV-ES-006)
// These tests do NOT require a live Elasticsearch instance.
// ---------------------------------------------------------------------------

function makeHitsResponse(hits: Array<{ _id: string; _score?: number }> = []) {
  return new Response(
    JSON.stringify({ hits: { hits } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function captureSearchQuery(
  adapterOptions: Omit<ConstructorParameters<typeof ElasticsearchAdapter>[0], "node">,
  searchParams: Parameters<ElasticsearchAdapter["search"]>[0],
): Promise<unknown> {
  let capturedQuery: unknown;

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const body = JSON.parse(init?.body as string) as { query: unknown };
    capturedQuery = body.query;
    return makeHitsResponse();
  });

  const adapter = new ElasticsearchAdapter({
    node: "http://localhost:9200",
    retry: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
    ...adapterOptions,
  });

  await adapter.search(searchParams);
  fetchSpy.mockRestore();
  return capturedQuery;
}

describe("ElasticsearchAdapter query construction", () => {
  // TV-ES-002: prefix: true → bool.should with phrase_prefix
  it("TV-ES-002: prefix: true emits bool.should with multi_match + phrase_prefix", async () => {
    const query = await captureSearchQuery(
      {},
      { resource: "todos", query: "to", prefix: true },
    );

    const q = query as { bool: { should: unknown[]; minimum_should_match: number } };
    expect(q.bool.minimum_should_match).toBe(1);
    expect(q.bool.should).toHaveLength(2);
    expect(q.bool.should).toEqual(
      expect.arrayContaining([
        { multi_match: { query: "to", fields: ["*"] } },
        { multi_match: { query: "to", fields: ["*"], type: "phrase_prefix" } },
      ]),
    );
  });

  // TV-ES-003: prefix omitted or false → single multi_match (unchanged behaviour)
  it("TV-ES-003: prefix omitted → single multi_match", async () => {
    const queryOmitted = await captureSearchQuery(
      {},
      { resource: "todos", query: "todo" },
    );
    expect(queryOmitted).toEqual({ multi_match: { query: "todo", fields: ["*"] } });
  });

  it("TV-ES-003: prefix: false → single multi_match", async () => {
    const queryFalse = await captureSearchQuery(
      {},
      { resource: "todos", query: "todo", prefix: false },
    );
    expect(queryFalse).toEqual({ multi_match: { query: "todo", fields: ["*"] } });
  });

  // TV-ES-004: prefix: true + fuzzy: true → three should clauses
  it("TV-ES-004: prefix + fuzzy emits three bool.should clauses", async () => {
    const query = await captureSearchQuery(
      {},
      { resource: "todos", query: "to", prefix: true, fuzzy: true },
    );

    const q = query as { bool: { should: unknown[]; minimum_should_match: number } };
    expect(q.bool.minimum_should_match).toBe(1);
    expect(q.bool.should).toHaveLength(3);
    expect(q.bool.should).toEqual(
      expect.arrayContaining([
        { multi_match: { query: "to", fields: ["*"] } },
        { multi_match: { query: "to", fields: ["*"], type: "phrase_prefix" } },
        { multi_match: { query: "to", fields: ["*"], fuzziness: "AUTO" } },
      ]),
    );
  });

  // TV-ES-005: construct-time defaults applied when query params omit options
  it("TV-ES-005: construct-time defaults.prefix + defaults.fuzzy are applied when params omit them", async () => {
    const query = await captureSearchQuery(
      { defaults: { prefix: true, fuzzy: true } },
      { resource: "todos", query: "to" }, // no prefix/fuzzy in params
    );

    const q = query as { bool: { should: unknown[] } };
    expect(q.bool.should).toHaveLength(3);
    expect(q.bool.should).toEqual(
      expect.arrayContaining([
        { multi_match: { query: "to", fields: ["*"] } },
        { multi_match: { query: "to", fields: ["*"], type: "phrase_prefix" } },
        { multi_match: { query: "to", fields: ["*"], fuzziness: "AUTO" } },
      ]),
    );
  });

  // TV-ES-006: query-time prefix: false overrides construct-time prefix: true default
  it("TV-ES-006: query-time prefix: false overrides construct-time default prefix: true", async () => {
    const query = await captureSearchQuery(
      { defaults: { prefix: true } },
      { resource: "todos", query: "todo", prefix: false },
    );

    // Explicit prefix: false wins — plain multi_match, no bool.should
    expect(query).toEqual({ multi_match: { query: "todo", fields: ["*"] } });
  });

  // TV-CAP-001 (ES part): capabilities.prefix is true
  it("TV-CAP-001: capabilities.prefix is true", () => {
    const adapter = new ElasticsearchAdapter({ node: "http://localhost:9200" });
    expect(adapter.capabilities?.prefix).toBe(true);
  });

  // Additional: fuzzy-only still produces single multi_match with fuzziness (no regression)
  it("fuzzy: true without prefix → single multi_match with fuzziness: AUTO", async () => {
    const query = await captureSearchQuery(
      {},
      { resource: "todos", query: "tdo", fuzzy: true },
    );
    expect(query).toEqual({ multi_match: { query: "tdo", fields: ["*"], fuzziness: "AUTO" } });
  });
});
