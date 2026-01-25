import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStorageAdapter } from "../memoryStorage.js";
import { IndexedDbStorageAdapter } from "../indexedDbStorage.js";
import "fake-indexeddb/auto"; // Use fake-indexeddb for IDB tests in Node/Vitest

// Helper to run tests against both adapters
function runAdapterTests(
  name: string,
  createAdapter: (resources?: string[]) => any
) {
  describe(`${name} Validation`, () => {
    let adapter: any;

    beforeEach(async () => {
      adapter = createAdapter(["tasks"]); // Valid resource "tasks"
    });

    afterEach(async () => {
      // Cleanup if needed (e.g. close DB)
      if (adapter.clear) adapter.clear();
    });

    it("TV-STORAGE-INVALID-STATE-001: Invalid hydration state throws", async () => {
      await expect(
        adapter.setHydrationState("tasks", "invalid_state")
      ).rejects.toThrow(/Invalid hydration state/);
    });

    it("TV-STORAGE-MEM-TRANSITION-001: Invalid transition (ready->notStarted) throws", async () => {
      // Set to ready first
      await adapter.setHydrationState("tasks", "hydrating");
      await adapter.setHydrationState("tasks", "ready");

      // Try invalid transition
      await expect(
        adapter.setHydrationState("tasks", "notStarted")
      ).rejects.toThrow(/Invalid hydration state transition/);
    });

    it("Valid transitions succeed", async () => {
      // notStarted -> hydrating
      await adapter.setHydrationState("tasks", "hydrating");
      expect(await adapter.getHydrationState("tasks")).toBe("hydrating");

      // hydrating -> ready
      await adapter.setHydrationState("tasks", "ready");
      expect(await adapter.getHydrationState("tasks")).toBe("ready");

      // ready -> hydrating (re-sync)
      await adapter.setHydrationState("tasks", "hydrating");
      expect(await adapter.getHydrationState("tasks")).toBe("hydrating");
    });

    it("TV-STORAGE-INVALID-CURSOR-001: Invalid cursor (number) throws", async () => {
      await expect(adapter.setCursor("tasks", 12345)).rejects.toThrow(
        /Invalid cursor format/
      );
    });

    it("Valid cursor (string, null) succeeds", async () => {
      await adapter.setCursor("tasks", "cursor-1");
      expect(await adapter.getCursor("tasks")).toBe("cursor-1");

      await adapter.setCursor("tasks", null);
      expect(await adapter.getCursor("tasks")).toBeNull();
    });

    it("TV-STORAGE-INVALID-MUTATION-001: Mutation missing clientId throws", async () => {
      await expect(
        adapter.changelogAppend({
          mutationId: "mut-1",
          // clientId missing
          resource: "tasks",
          operation: "insert",
          record: {},
        })
      ).rejects.toThrow(/Missing clientId/);
    });

    it("Mutation missing mutationId throws", async () => {
      await expect(
        adapter.changelogAppend({
          clientId: "client-1",
          // mutationId missing
          resource: "tasks",
          operation: "insert",
          record: {},
        })
      ).rejects.toThrow(/Missing mutationId/);
    });

    it("Unknown table throws if resources provided", async () => {
      // Adapter created with ["tasks"]
      await expect(adapter.getRecord("unknown_table", "id-1")).rejects.toThrow(
        /Unknown table/
      );
    });
  });
}

// Run tests
runAdapterTests("MemoryStorageAdapter", (resources) => new MemoryStorageAdapter(resources));
runAdapterTests("IndexedDbStorageAdapter", (resources) => new IndexedDbStorageAdapter("test_db_" + Date.now(), resources));
