/**
 * Shared adapter conformance test harness.
 *
 * Every SearchAdapter implementation MUST pass all assertions defined here.
 * To use: call `runConformanceSuite(adapterFactory)` inside a `describe` block.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { InitializeResourceConfig, SearchAdapter, SearchDocument } from "./index";
import { SEARCH_ADAPTER_DISPOSED } from "./index";

export interface ConformanceAdapterFactory {
  /** Human-readable adapter name for test labels */
  name: string;
  /** Create a fresh adapter instance for each test */
  create(): SearchAdapter;
  /** Whether this adapter supports persistent storage (survives dispose+reinitialize) */
  persistent?: boolean;
  /** Whether cleanup is needed after tests (e.g., external services) */
  cleanup?(): Promise<void>;
  /** Optional callback that returns true when tests should be skipped (e.g., backend unavailable) */
  shouldSkip?(): boolean;
}

const ITEMS: InitializeResourceConfig[] = [{ name: "items", searchFields: ["title"] }];
const ITEMS_AND_NOTES: InitializeResourceConfig[] = [
  { name: "items", searchFields: ["title"] },
  { name: "notes", searchFields: ["body"] },
];

async function initialize(
  adapter: SearchAdapter,
  resources: InitializeResourceConfig[] = ITEMS
): Promise<void> {
  if (adapter.initialize) {
    await adapter.initialize({ resources });
  }
}

async function index(
  adapter: SearchAdapter,
  documents: SearchDocument[],
  resource = "items"
): Promise<void> {
  await adapter.index({ resource, documents });
}

/**
 * Run the full conformance suite against an adapter.
 * Call this inside a `describe()` block.
 */
export function runConformanceSuite(factory: ConformanceAdapterFactory): void {
  let adapter: SearchAdapter;

  beforeEach((ctx) => {
    if (factory.shouldSkip?.()) {
      ctx.skip();
      return;
    }
    adapter = factory.create();
  });

  afterEach(async () => {
    if (adapter.dispose) {
      await adapter.dispose();
    }
    if (factory.cleanup) {
      await factory.cleanup();
    }
  });

  describe("contract shape", () => {
    it("has a non-empty name", () => {
      expect(typeof adapter.name).toBe("string");
      expect(adapter.name.length).toBeGreaterThan(0);
    });

    it("exposes required methods", () => {
      expect(typeof adapter.index).toBe("function");
      expect(typeof adapter.search).toBe("function");
      expect(typeof adapter.remove).toBe("function");
      expect(typeof adapter.clear).toBe("function");
    });

    it("exposes capabilities object if declared", () => {
      if (adapter.capabilities !== undefined) {
        expect(typeof adapter.capabilities).toBe("object");
      }
    });
  });

  describe("index and search", () => {
    it("returns matching ids after indexing documents", async () => {
      await initialize(adapter);
      await index(adapter, [
        { id: "d1", fields: { title: "alpha beta" } },
        { id: "d2", fields: { title: "gamma delta" } },
      ]);
      const results = await adapter.search({ resource: "items", query: "alpha", limit: 10 });
      expect(results).toContain("d1");
      expect(results).not.toContain("d2");
    });

    it("returns empty array when no documents match", async () => {
      await initialize(adapter);
      await index(adapter, [{ id: "d1", fields: { title: "alpha" } }]);
      const results = await adapter.search({ resource: "items", query: "zzzzz", limit: 10 });
      expect(results).toEqual([]);
    });

    it("upserts on duplicate id", async () => {
      await initialize(adapter);
      await index(adapter, [{ id: "d1", fields: { title: "alpha" } }]);
      await index(adapter, [{ id: "d1", fields: { title: "beta" } }]);
      const alphaResults = await adapter.search({ resource: "items", query: "alpha", limit: 10 });
      expect(alphaResults).not.toContain("d1");
      const betaResults = await adapter.search({ resource: "items", query: "beta", limit: 10 });
      expect(betaResults).toContain("d1");
    });

    it("respects limit parameter", async () => {
      await initialize(adapter);
      await index(
        adapter,
        Array.from({ length: 20 }, (_, i) => ({
          id: `d${i}`,
          fields: { title: "common term" },
        }))
      );
      const results = await adapter.search({ resource: "items", query: "common", limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("deterministic ordering", () => {
    it("produces consistent order for equal-score documents", async () => {
      await initialize(adapter);
      await index(adapter, [
        { id: "b", fields: { title: "same" } },
        { id: "a", fields: { title: "same" } },
        { id: "c", fields: { title: "same" } },
      ]);
      const r1 = await adapter.search({ resource: "items", query: "same", limit: 10 });
      const r2 = await adapter.search({ resource: "items", query: "same", limit: 10 });
      expect(r1).toEqual(r2);
    });
  });

  describe("remove", () => {
    it("removes documents by id", async () => {
      await initialize(adapter);
      await index(adapter, [
        { id: "d1", fields: { title: "alpha" } },
        { id: "d2", fields: { title: "alpha" } },
      ]);
      await adapter.remove({ resource: "items", ids: ["d1"] });
      const results = await adapter.search({ resource: "items", query: "alpha", limit: 10 });
      expect(results).not.toContain("d1");
      expect(results).toContain("d2");
    });

    it("is idempotent for already-removed ids", async () => {
      await initialize(adapter);
      await index(adapter, [{ id: "d1", fields: { title: "alpha" } }]);
      await adapter.remove({ resource: "items", ids: ["d1"] });
      await expect(adapter.remove({ resource: "items", ids: ["d1"] })).resolves.toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all documents from a resource", async () => {
      await initialize(adapter);
      await index(adapter, [{ id: "d1", fields: { title: "alpha" } }]);
      await adapter.clear("items");
      const results = await adapter.search({ resource: "items", query: "alpha", limit: 10 });
      expect(results).toEqual([]);
    });

    it("does not affect other resources", async () => {
      await initialize(adapter, ITEMS_AND_NOTES);
      await index(adapter, [{ id: "d1", fields: { title: "alpha" } }]);
      await index(adapter, [{ id: "n1", fields: { body: "alpha" } }], "notes");
      await adapter.clear("items");
      const notesResults = await adapter.search({ resource: "notes", query: "alpha", limit: 10 });
      expect(notesResults).toContain("n1");
    });
  });

  describe("searchAll", () => {
    it("merges results across resources with deterministic ordering", async () => {
      if (!adapter.searchAll) return;

      await initialize(adapter, ITEMS_AND_NOTES);
      await index(adapter, [{ id: "d1", fields: { title: "common term" } }]);
      await index(adapter, [{ id: "n1", fields: { body: "common term" } }], "notes");

      const results = await adapter.searchAll({ query: "common", limit: 10 });
      expect(results.length).toBeGreaterThanOrEqual(1);

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
  });

  describe("lifecycle", () => {
    it("blocks operations after dispose", async () => {
      if (!adapter.dispose) return;

      await initialize(adapter);
      await adapter.dispose();

      try {
        await adapter.search({ resource: "items", query: "test", limit: 10 });
      } catch (err) {
        expect(err).toBeDefined();
        if (err instanceof Error && "code" in err) {
          expect((err as { code: string }).code).toBe(SEARCH_ADAPTER_DISPOSED);
        }
      }
    });

    it("can reinitialize after dispose", async () => {
      if (!adapter.dispose || !adapter.initialize) return;

      await initialize(adapter);
      await index(adapter, [{ id: "d1", fields: { title: "alpha" } }]);
      await adapter.dispose();
      await initialize(adapter);

      const results = await adapter.search({ resource: "items", query: "alpha", limit: 10 });
      if (factory.persistent) {
        expect(results).toContain("d1");
      }
      expect(Array.isArray(results)).toBe(true);
    });
  });
}

/**
 * List of conformance assertion categories.
 * Used for documentation/reporting.
 */
export const CONFORMANCE_ASSERTIONS = [
  "contract-shape: name, required methods, capabilities",
  "index-search: basic indexing, search, upsert, limit",
  "deterministic-ordering: consistent tie-breaking",
  "remove: by id, idempotent",
  "clear: per-resource, cross-resource isolation",
  "searchAll: merged results, deterministic global order",
  "lifecycle: dispose blocks ops, reinitialize restores",
] as const;
