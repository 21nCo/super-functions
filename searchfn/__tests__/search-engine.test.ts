import { describe, expect, it } from "vitest";
import { createEngineWithDocuments, createTestEngine } from "./helpers/test-utils";

describe("SearchFn", () => {
  it("indexes and retrieves documents", async () => {
    const engine = await createEngineWithDocuments(
      [
        {
          id: "doc-1",
          fields: {
            title: "Quick brown fox",
            body: "Jumps over the lazy dog"
          }
        },
        {
          id: "doc-2",
          fields: {
            title: "Slow turtle",
            body: "Crawls under the fence"
          }
        }
      ],
      { fields: ["title", "body"] }
    );

    const results = await engine.search("quick fox", { limit: 5 });
    expect(results[0]).toBe("doc-1");
  });

  it("supports document removal", async () => {
    const engine = createTestEngine({ fields: ["body"] });

    await engine.add({
      id: "keep",
      fields: { body: "alpha beta gamma" }
    });

    await engine.add({
      id: "remove",
      fields: { body: "beta gamma delta" }
    });

    await engine.remove("remove");

    const results = await engine.search("delta");
    expect(results).toEqual([]);
  });

  it("hydrates stored documents when requested", async () => {
    const engine = createTestEngine({ fields: ["body"] });

    await engine.add({
      id: "doc-1",
      fields: { body: "delta epsilon zeta" },
      store: { body: "delta epsilon zeta" }
    });

    const results = await engine.searchDetailed("delta", { includeStored: true });
    expect(results[0]).toMatchObject({
      docId: "doc-1",
      document: { body: "delta epsilon zeta" }
    });
  });

  it("exports and imports snapshots", async () => {
    const source = await createEngineWithDocuments(
      [
        {
          id: "doc-1",
          fields: { title: "Snapshot testing" }
        }
      ],
      { fields: ["title"] }
    );

    const snapshot = await source.exportSnapshot();
    const restored = createTestEngine({ fields: ["title"] });

    await restored.importSnapshot(snapshot);
    const results = await restored.search("snapshot");
    expect(results[0]).toBe("doc-1");
  });

  it("exports and imports worker snapshots", async () => {
    const source = await createEngineWithDocuments(
      [
        {
          id: "doc-1",
          fields: { title: "Worker snapshot" }
        }
      ],
      { fields: ["title"] }
    );

    const payload = await source.exportWorkerSnapshot();
    const restored = createTestEngine({ fields: ["title"] });

    await restored.importWorkerSnapshot(payload);
    const results = await restored.search("worker");
    expect(results).toContain("doc-1");
  });

  it("clears indexed and stored documents", async () => {
    const engine = createTestEngine({ fields: ["body"] });

    await engine.add({
      id: "doc-1",
      fields: { body: "alpha beta" },
      store: { body: "alpha beta" }
    });

    expect(await engine.search("alpha")).toEqual(["doc-1"]);
    expect(await engine.getDocument("doc-1")).toEqual({ body: "alpha beta" });

    await engine.clear();

    expect(await engine.search("alpha")).toEqual([]);
    expect(await engine.getDocument("doc-1")).toBeUndefined();

    await engine.add({
      id: "doc-2",
      fields: { body: "gamma" }
    });

    expect(await engine.search("gamma")).toEqual(["doc-2"]);
  });

  it("respects field filters during search", async () => {
    const engine = createTestEngine({ fields: ["title", "body"] });

    await engine.add({
      id: "doc-1",
      fields: {
        title: "Alpha title",
        body: "Unique body term"
      }
    });

    const titleOnly = await engine.search("unique", { fields: ["title"] });
    expect(titleOnly).toEqual([]);

    const bodyOnly = await engine.search("unique", { fields: ["body"] });
    expect(bodyOnly).toEqual(["doc-1"]);
  });

  it("returns no results when the query produces no tokens", async () => {
    const engine = createTestEngine({ fields: ["body"] });

    await engine.add({
      id: "doc-1",
      fields: { body: "alpha beta" }
    });

    expect(await engine.search("!!!")).toEqual([]);
    expect(await engine.search("the and")).toEqual([]);
  });

  it("preserves removals when exporting and importing snapshots", async () => {
    const engine = await createEngineWithDocuments(
      [
        { id: "keep", fields: { body: "alpha beta" } },
        { id: "drop", fields: { body: "beta gamma" } }
      ],
      { fields: ["body"] }
    );

    await engine.remove("drop");

    const snapshot = await engine.exportSnapshot();
    const restored = createTestEngine({ fields: ["body"] });
    await restored.importSnapshot(snapshot);

    expect(await restored.search("gamma")).toEqual([]);
    expect(await restored.search("alpha")).toEqual(["keep"]);
  });
});
