import { describe, expect, it } from "vitest";
import { createDocumentsFromFlexStore, migrateFlexStoreToSearchFn } from "../src/compat/migration";
import { createTestEngine } from "./helpers/test-utils";

describe("compat/migration", () => {
  it("creates documents from a flexsearch store", () => {
    const store = {
      "1": {
        title: "First title",
        tags: ["alpha", "beta"],
        body: "Sample body"
      },
      "2": {
        title: "Second",
        body: null
      }
    } satisfies Record<string, Record<string, unknown>>;

    const { documents, skipped } = createDocumentsFromFlexStore(store, {
      indexFields: ["title", "body"],
      storeFields: ["title", "tags"],
      filterDocument: (record) => typeof record.body === "string"
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: "1",
      fields: {
        title: "First title",
        body: "Sample body"
      },
      store: {
        title: "First title",
        tags: ["alpha", "beta"]
      }
    });
    expect(skipped).toEqual(["2"]);
  });

  it("migrates documents into the search engine", async () => {
    const store = {
      a: {
        title: "Alpha document",
        body: "Contains the word migrate",
        tags: ["alpha", "test"]
      },
      b: {
        title: "Beta document",
        body: "Another migrate example",
        tags: ["beta"]
      }
    } satisfies Record<string, Record<string, unknown>>;

    const engine = createTestEngine({ fields: ["title", "body"] });

    const { documents } = await migrateFlexStoreToSearchFn(engine, store, {
      indexFields: ["title", "body"],
      storeFields: ["tags"],
      concurrency: 2
    });

    expect(documents).toHaveLength(2);

    const results = await engine.searchDetailed("migrate", { includeStored: true });
    expect(results).toHaveLength(2);
    expect(results[0].document).toBeDefined();
  });
});
