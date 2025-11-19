import { beforeAll, describe, expect, it } from "vitest";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { FlexSearchIndexAdapter } from "../src/compat/index-adapter";
import { FlexSearchDocumentAdapter } from "../src/compat/document-adapter";

beforeAll(() => {
  const globalObject = globalThis as unknown as {
    indexedDB: IDBFactory;
    IDBKeyRange?: typeof IDBKeyRange;
  };
  globalObject.indexedDB = indexedDB;
  globalObject.IDBKeyRange = IDBKeyRange as unknown as typeof globalObject.IDBKeyRange;
});

describe("FlexSearch compatibility", () => {
  it("indexes, searches, and removes documents via Index adapter", async () => {
    const adapter = new FlexSearchIndexAdapter({
      name: `compat-index-${Math.random().toString(16).slice(2)}`,
      fields: ["text"],
      cache: {
        term: 256
      }
    });

    await adapter.addAsync("a", "quick brown fox");
    await adapter.addAsync("b", "slow turtle");

    const initial = await adapter.searchAsync("quick", { limit: 5 });
    expect(initial).toEqual(["a"]);

    await adapter.removeAsync("a");
    const afterRemoval = await adapter.searchAsync("quick", { limit: 5 });
    expect(afterRemoval).toEqual([]);

    const snapshot = await adapter.exportWorkerSnapshot();
    await adapter.clear();

    const restored = new FlexSearchIndexAdapter({
      name: `compat-index-${Math.random().toString(16).slice(2)}`,
      fields: ["text"],
      cache: { term: 256 }
    });

    await restored.importWorkerSnapshot(snapshot);
    await restored.addAsync("c", "returning fox");
    const postImport = await restored.searchCacheAsync("fox", { limit: 5 });
    expect(postImport.sort()).toEqual(["c"]);

    await restored.clear();
  });

  it("hydrates stored payloads via Document adapter", async () => {
    const adapter = new FlexSearchDocumentAdapter({
      name: `compat-doc-${Math.random().toString(16).slice(2)}`,
      fields: ["title", "body"],
      document: {
        id: "id",
        index: ["title", "body"],
        store: ["title"]
      }
    });

    await adapter.add({
      id: "doc-1",
      fields: {
        title: "Adapter index",
        body: "adapter document search"
      },
      store: {
        title: "Adapter index"
      }
    });

    const results = await adapter.search("adapter", { limit: 5 });
    expect(results[0].result).toContain("doc-1");
    expect(results[0].documents?.[0]).toMatchObject({
      id: "doc-1",
      document: { title: "Adapter index" }
    });

    await adapter.remove("doc-1");
    const empty = await adapter.search("adapter", { limit: 5 });
    expect(empty[0].result).toEqual([]);
  });
});
