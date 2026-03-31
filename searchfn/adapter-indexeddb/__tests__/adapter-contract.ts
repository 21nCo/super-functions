import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";

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

    it("indexes documents and returns matching DocIds on search", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [
          { id: "task:1", fields: { title: "Buy groceries", description: "Get milk and bread" } },
          { id: "task:2", fields: { title: "Review pull request", description: "Check auth changes" } }
        ]
      });
      const result = await adapter.search({ resource: "tasks", query: "groceries", limit: 10 });
      expect(result).toEqual(["task:1"]);
    });

    it("returns empty array when query matches nothing", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "task:1", fields: { title: "Buy groceries" } }]
      });
      const result = await adapter.search({ resource: "tasks", query: "xyznonexistent", limit: 10 });
      expect(result).toEqual([]);
    });

    it("remove makes document invisible to search", async () => {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "task:1", fields: { title: "Buy groceries" } }]
      });
      await adapter.remove({ resource: "tasks", ids: ["task:1"] });
      const result = await adapter.search({ resource: "tasks", query: "groceries" });
      expect(result).toEqual([]);
    });

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
      const result = await adapter.search({ resource: "tasks", query: "groceries" });
      expect(result).toEqual([]);
    });

    it("works without calling initialize first", async () => {
      await adapter.index({ resource: "x", documents: [{ id: "1", fields: { a: "hello" } }] });
      const result = await adapter.search({ resource: "x", query: "hello" });
      expect(result).toContain("1");
    });

    if (createAdapter().dispose) {
      it("throws SEARCH_ADAPTER_DISPOSED after dispose", async () => {
        const freshAdapter = createAdapter();
        await freshAdapter.index({ resource: "x", documents: [{ id: "1", fields: { a: "hello" } }] });
        await freshAdapter.dispose!();
        await expect(freshAdapter.search({ resource: "x", query: "hello" })).rejects.toMatchObject({
          code: SEARCH_ADAPTER_DISPOSED,
          message: "Search adapter is disposed. Call initialize() before use."
        });
      });
    }
  });
}
