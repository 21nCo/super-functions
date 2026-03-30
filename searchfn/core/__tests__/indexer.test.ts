import { describe, expect, it } from "vitest";
import { Indexer } from "../src/indexing/indexer";

describe("Indexer", () => {
  it("produces field term frequencies and lengths", () => {
    const indexer = new Indexer();
    const result = indexer.ingest({
      docId: "doc-1",
      fields: {
        title: "The quick brown fox",
        body: "Foxes are running quickly"
      }
    });

    expect(result.docId).toBe("doc-1");
    expect(result.fieldLengths.get("title")).toBe(3);
    expect(result.fieldLengths.get("body")).toBe(3);

    const titleFreq = result.fieldFrequencies.get("title");
    expect(titleFreq?.get("quick")).toBe(1);
    expect(titleFreq?.get("brown")).toBe(1);
  });

  it("keeps cached batch tokens scoped to the current document id", () => {
    const indexer = new Indexer();
    const results = indexer.ingestBatch([
      {
        docId: "doc-1",
        fields: { title: "shared text" },
      },
      {
        docId: "doc-2",
        fields: { title: "shared text" },
      },
    ]);

    expect(results.map((result) => result.docId)).toEqual(["doc-1", "doc-2"]);
  });
});
