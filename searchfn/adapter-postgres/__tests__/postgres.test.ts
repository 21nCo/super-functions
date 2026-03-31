/**
 * Postgres adapter integration tests.
 *
 * Requires a running Postgres instance (see docker-compose.postgres.yml).
 * Set SEARCHFN_PG_URL to override the connection string.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { PostgresAdapter } from "../src/index";
import { SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";
import { redactSensitive as redactPostgresSensitive } from "../src/internal/redaction";

const PG_URL =
  process.env.SEARCHFN_PG_URL ?? "postgres://searchfn:searchfn_test@localhost:5433/searchfn_test";

function canConnect(): Promise<boolean> {
  const pool = new Pool({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  return pool
    .query("SELECT 1")
    .then(() => {
      pool.end();
      return true;
    })
    .catch(() => {
      pool.end();
      return false;
    });
}

describe("PostgresAdapter integration", () => {
  let adapter: PostgresAdapter;
  let available = false;

  beforeAll(async () => {
    available = await canConnect();
    if (!available) {
      console.warn("Postgres not available, skipping integration tests");
    }
  });

  beforeEach(async () => {
    if (!available) return;

    adapter = new PostgresAdapter({
      connectionString: PG_URL,
      queryTimeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 50 },
    });

    await adapter.initialize({
      resources: [
        { name: "tasks", searchFields: ["title", "body"] },
        { name: "notes", searchFields: ["content"] },
      ],
    });

    // Clean up before each test
    await adapter.clear("tasks");
    await adapter.clear("notes");
  });

  afterAll(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  // ── TV-ADP-PG-001: end-to-end index/search/remove ──────────────

  it("indexes documents and returns matching ids", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "1", fields: { title: "report", body: "q1 financials" } },
        { id: "2", fields: { title: "meeting", body: "standup notes" } },
      ],
    });

    const results = await adapter.search({
      resource: "tasks",
      query: "report",
      limit: 10,
    });
    expect(results).toContain("1");
    expect(results).not.toContain("2");
  });

  it("removes documents and they no longer appear in search", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "report", body: "q1" } }],
    });

    const firstSearch = await adapter.search({ resource: "tasks", query: "report", limit: 10 });
    expect(firstSearch).toContain("1");

    await adapter.remove({ resource: "tasks", ids: ["1"] });

    const secondSearch = await adapter.search({ resource: "tasks", query: "report", limit: 10 });
    expect(secondSearch).toEqual([]);
  });

  // ── Upsert semantics ───────────────────────────────────────────

  it("upserts on duplicate id", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "alpha" } }],
    });
    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "beta" } }],
    });

    const alpha = await adapter.search({ resource: "tasks", query: "alpha", limit: 10 });
    expect(alpha).not.toContain("1");

    const beta = await adapter.search({ resource: "tasks", query: "beta", limit: 10 });
    expect(beta).toContain("1");
  });

  // ── Deterministic ordering ─────────────────────────────────────

  it("produces deterministic ordering for equal-score docs", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "b", fields: { title: "same" } },
        { id: "a", fields: { title: "same" } },
        { id: "c", fields: { title: "same" } },
      ],
    });

    const r1 = await adapter.search({ resource: "tasks", query: "same", limit: 10 });
    const r2 = await adapter.search({ resource: "tasks", query: "same", limit: 10 });
    expect(r1).toEqual(r2);
    // Verify sorted by id ASC when scores are equal
    expect(r1).toEqual(["a", "b", "c"]);
  });

  // ── searchAll ──────────────────────────────────────────────────

  it("searchAll merges results across resources with deterministic sort", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "t1", fields: { title: "common term" } }],
    });
    await adapter.index({
      resource: "notes",
      documents: [{ id: "n1", fields: { content: "common term" } }],
    });

    const results = await adapter.searchAll({ query: "common", limit: 10 });
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Verify deterministic ordering
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

  // ── Clear ──────────────────────────────────────────────────────

  it("clear removes all documents from a resource", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "1", fields: { title: "alpha" } },
        { id: "2", fields: { title: "beta" } },
      ],
    });

    await adapter.clear("tasks");

    const results = await adapter.search({ resource: "tasks", query: "alpha", limit: 10 });
    expect(results).toEqual([]);
  });

  it("clear does not affect other resources", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "alpha" } }],
    });
    await adapter.index({
      resource: "notes",
      documents: [{ id: "n1", fields: { content: "alpha" } }],
    });

    await adapter.clear("tasks");

    const notesResults = await adapter.search({ resource: "notes", query: "alpha", limit: 10 });
    expect(notesResults).toContain("n1");
  });

  it("removes stale rows when a document is reindexed with zero searchable fields", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "vanishing document" } }],
    });

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: {} }],
    });

    const results = await adapter.search({ resource: "tasks", query: "vanishing", limit: 10 });
    expect(results).toEqual([]);
  });

  it("round-trips canonical numeric ids as numbers", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: 123, fields: { title: "numeric id" } }],
    });

    const results = await adapter.search({ resource: "tasks", query: "numeric", limit: 10 });
    expect(results).toEqual([123]);
  });

  // ── Lifecycle ──────────────────────────────────────────────────

  it("blocks operations after dispose", async () => {
    if (!available) return;

    await adapter.dispose();

    try {
      await adapter.search({ resource: "tasks", query: "test", limit: 10 });
      expect.fail("Should have thrown after dispose");
    } catch (err) {
      expect(err).toBeDefined();
      expect((err as { code: string }).code).toBe(SEARCH_ADAPTER_DISPOSED);
    }
  });

  it("can reinitialize after dispose and retains persistent data", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "persistent" } }],
    });
    await adapter.dispose();

    await adapter.initialize({
      resources: [{ name: "tasks", searchFields: ["title", "body"] }],
    });

    const results = await adapter.search({ resource: "tasks", query: "persistent", limit: 10 });
    expect(results).toContain("1");
  });

  // ── Remove idempotency ────────────────────────────────────────

  it("remove is idempotent for already-removed ids", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "alpha" } }],
    });
    await adapter.remove({ resource: "tasks", ids: ["1"] });
    // Should not throw
    await expect(adapter.remove({ resource: "tasks", ids: ["1"] })).resolves.toBeUndefined();
  });

  // ── Limit parameter ───────────────────────────────────────────

  it("respects limit parameter", async () => {
    if (!available) return;

    const docs = Array.from({ length: 20 }, (_, i) => ({
      id: `d${i}`,
      fields: { title: "common term" },
    }));
    await adapter.index({ resource: "tasks", documents: docs });

    const results = await adapter.search({ resource: "tasks", query: "common", limit: 5 });
    expect(results.length).toBeLessThanOrEqual(5);
  });

  // ── Field filtering ───────────────────────────────────────────

  it("supports field filtering in search", async () => {
    if (!available) return;

    await adapter.index({
      resource: "tasks",
      documents: [
        { id: "1", fields: { title: "alpha", body: "beta" } },
      ],
    });

    const titleOnly = await adapter.search({
      resource: "tasks",
      query: "alpha",
      fields: ["title"],
      limit: 10,
    });
    expect(titleOnly).toContain("1");

    const bodyOnly = await adapter.search({
      resource: "tasks",
      query: "alpha",
      fields: ["body"],
      limit: 10,
    });
    expect(bodyOnly).not.toContain("1");
  });

  // ── Bulk index efficiency ─────────────────────────────────────

  it("handles bulk indexing", async () => {
    if (!available) return;

    const docs = Array.from({ length: 100 }, (_, i) => ({
      id: `bulk-${i}`,
      fields: { title: `document number ${i}` },
    }));
    await adapter.index({ resource: "tasks", documents: docs });

    const results = await adapter.search({ resource: "tasks", query: "document", limit: 100 });
    expect(results.length).toBe(100);
  });

  // ── TV-NEG-005: connection failure error handling ──────────────

  it("wraps connection errors without leaking connection string", async () => {
    const badAdapter = new PostgresAdapter({
      connectionString: "postgres://invalid-host:9999/db",
      queryTimeoutMs: 2000,
      retry: { maxRetries: 0 },
    });

    try {
      await badAdapter.initialize({
        resources: [{ name: "test", searchFields: ["title"] }],
      });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeDefined();
      const msg = (err as Error).message;
      expect(msg).not.toContain("invalid-host:9999");
    }
  });
});

describe("PostgresAdapter redaction", () => {
  it("redacts plain connection keys without over-redacting connectionTimeout", () => {
    expect(
      redactPostgresSensitive({
        connection: "postgres://user:pass@example.test/db",
        connectionTimeout: 5000,
      }),
    ).toEqual({
      connection: "[REDACTED]",
      connectionTimeout: 5000,
    });
  });

  it("redacts Error instances before returning them", () => {
    const error = Object.assign(new Error("password=secret"), {
      connection: "postgres://user:pass@example.test/db",
    });

    expect(redactPostgresSensitive(error)).toMatchObject({
      name: "Error",
      message: "password=[REDACTED]",
      connection: "[REDACTED]",
    });
  });
});

// ── TV-PG-001/002/003: prefix search and defaults ─────────────────────────────

describe("PostgresAdapter — prefix search", () => {
  let adapter: PostgresAdapter;
  let available = false;

  beforeAll(async () => {
    available = await canConnect();
    if (!available) {
      console.warn("Postgres not available, skipping prefix tests");
    }
  });

  beforeEach(async () => {
    if (!available) return;
    adapter = new PostgresAdapter({
      connectionString: PG_URL,
      queryTimeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 50 },
    });
    await adapter.initialize({
      resources: [{ name: "prefix_test", searchFields: ["text"] }],
    });
    await adapter.clear("prefix_test");
  });

  afterAll(async () => {
    if (adapter) await adapter.dispose();
  });

  // TV-PG-001
  it("TV-PG-001: prefix: true matches partial terms using :* operator", async () => {
    if (!available) return;
    await adapter.index({
      resource: "prefix_test",
      documents: [{ id: "1", fields: { text: "testing" } }],
    });
    const result = await adapter.search({
      resource: "prefix_test",
      query: "test",
      prefix: true,
      limit: 10,
    });
    expect(result).toContain("1");
  });

  // TV-PG-002
  it("TV-PG-002: prefix: true + fuzzy: true does not duplicate :* and returns result", async () => {
    if (!available) return;
    await adapter.index({
      resource: "prefix_test",
      documents: [{ id: "1", fields: { text: "testing" } }],
    });
    const result = await adapter.search({
      resource: "prefix_test",
      query: "test",
      prefix: true,
      fuzzy: true,
      limit: 10,
    });
    expect(result).toContain("1");
  });

  // TV-PG-003
  it("TV-PG-003: construct-time defaults.prefix applied when param omitted", async () => {
    if (!available) return;
    const defaultsAdapter = new PostgresAdapter({
      connectionString: PG_URL,
      queryTimeoutMs: 10_000,
      retry: { maxRetries: 1, baseDelayMs: 50 },
      defaults: { prefix: true },
    });
    try {
      await defaultsAdapter.initialize({
        resources: [{ name: "prefix_defaults", searchFields: ["text"] }],
      });
      await defaultsAdapter.clear("prefix_defaults");
      await defaultsAdapter.index({
        resource: "prefix_defaults",
        documents: [{ id: "1", fields: { text: "testing" } }],
      });
      const result = await defaultsAdapter.search({
        resource: "prefix_defaults",
        query: "test",
        limit: 10,
      });
      expect(result).toContain("1");
    } finally {
      await defaultsAdapter.dispose();
    }
  });

  it("TV-PG-CAP: capabilities include prefix: true", () => {
    const a = new PostgresAdapter({ connectionString: PG_URL });
    expect(a.capabilities.prefix).toBe(true);
  });
});
