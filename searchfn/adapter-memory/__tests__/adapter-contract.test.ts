import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { SearchAdapterError, SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";
import { MemoryAdapter } from "../src/index";

export function runAdapterContractTests(
  adapterName: string,
  createAdapter: () => SearchAdapter
): void {
  describe(`${adapterName} — contract tests`, () => {
    let adapter: SearchAdapter;

    beforeEach(() => {
      adapter = createAdapter();
    });

    afterEach(async () => {
      if (adapter.dispose) {
        await adapter.dispose();
      }
    });

    // TV-MEM-001
    it("indexes documents and returns matching DocIds on search", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [
          {
            id: "task:1",
            fields: { title: "Buy groceries", description: "Get milk and bread" }
          },
          {
            id: "task:2",
            fields: {
              title: "Review pull request",
              description: "Check auth changes"
            }
          }
        ]
      });
      const result = await adapter.search({
        resource: "tasks",
        query: "groceries",
        limit: 10
      });
      expect(result).toEqual(["task:1"]);
    });

    // TV-MEM-002
    it("returns empty array when query matches nothing", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [
          {
            id: "task:1",
            fields: { title: "Buy groceries" }
          }
        ]
      });
      const result = await adapter.search({
        resource: "tasks",
        query: "xyznonexistent",
        limit: 10
      });
      expect(result).toEqual([]);
    });

    // TV-MEM-003
    it("remove makes document invisible to search", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "task:1", fields: { title: "Buy groceries" } }]
      });
      await adapter.remove({ resource: "tasks", ids: ["task:1"] });
      const result = await adapter.search({
        resource: "tasks",
        query: "groceries"
      });
      expect(result).toEqual([]);
    });

    // TV-MEM-004
    it("clear removes all documents from a resource", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [
          { id: "1", fields: { title: "Buy groceries" } },
          { id: "2", fields: { title: "Review request" } },
          { id: "3", fields: { title: "Write tests" } }
        ]
      });
      await adapter.clear("tasks");
      const result = await adapter.search({
        resource: "tasks",
        query: "groceries"
      });
      expect(result).toEqual([]);
    });

    // TV-MEM-005
    it("field restriction limits search to specified fields", async () => {
      await adapter.index({
        resource: "items",
        documents: [
          { id: "1", fields: { title: "Alpha", description: "Beta" } }
        ]
      });
      const result = await adapter.search({
        resource: "items",
        query: "Beta",
        fields: ["title"]
      });
      expect(result).toEqual([]);
    });

    // TV-UPS-001
    it("upsert replaces old document — old content not searchable", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "old title" } }]
      });
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "new title" } }]
      });
      const result = await adapter.search({
        resource: "tasks",
        query: "old"
      });
      expect(result).toEqual([]);
    });

    // TV-UPS-002
    it("upsert replaces old document — new content is searchable", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "old title" } }]
      });
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "new title" } }]
      });
      const result = await adapter.search({
        resource: "tasks",
        query: "new"
      });
      expect(result).toContain("1");
    });

    // TV-ISO-001
    it("resource A documents are not visible in resource B search", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "Secret task" } }]
      });
      const result = await adapter.search({
        resource: "notes",
        query: "Secret"
      });
      expect(result).toEqual([]);
    });

    // TV-ISO-002
    it("clearing resource A does not affect resource B", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "t1", fields: { title: "Task item" } }]
      });
      await adapter.index({
        resource: "notes",
        documents: [{ id: "n1", fields: { title: "Note item" } }]
      });
      await adapter.clear("tasks");
      const result = await adapter.search({
        resource: "notes",
        query: "Note"
      });
      expect(result).toContain("n1");
    });

    // TV-LIFE-001
    it("works without calling initialize first", async () => {
      await adapter.index({
        resource: "x",
        documents: [{ id: "1", fields: { a: "hello" } }]
      });
      const result = await adapter.search({ resource: "x", query: "hello" });
      expect(result).toContain("1");
    });

    // TV-LIFE-002 — only meaningful for adapters with dispose
    if (createAdapter().dispose) {
      it("throws SEARCH_ADAPTER_DISPOSED after dispose", async () => {
        const freshAdapter = createAdapter();
        await freshAdapter.index({
          resource: "x",
          documents: [{ id: "1", fields: { a: "hello" } }]
        });
        await freshAdapter.dispose!();
        await expect(
          freshAdapter.search({ resource: "x", query: "hello" })
        ).rejects.toMatchObject({
          code: SEARCH_ADAPTER_DISPOSED,
          message: "Search adapter is disposed. Call initialize() before use."
        });
      });

      if (createAdapter().initialize) {
        it("allows explicit reinitialize after dispose", async () => {
          const freshAdapter = createAdapter();
          await freshAdapter.dispose!();
          await freshAdapter.initialize!({ resources: [{ name: "x", searchFields: ["a"] }] });
          await freshAdapter.index({
            resource: "x",
            documents: [{ id: "1", fields: { a: "hello" } }],
          });
          await expect(
            freshAdapter.search({ resource: "x", query: "hello" }),
          ).resolves.toContain("1");
        });
      }
    }
  });
}

runAdapterContractTests("MemoryAdapter", () => new MemoryAdapter());
