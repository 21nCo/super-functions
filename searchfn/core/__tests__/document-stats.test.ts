import { describe, expect, it } from "vitest";
import { DocumentStatsManager } from "../src/query/document-stats";

describe("DocumentStatsManager", () => {
  it("keeps numeric and string doc ids distinct", () => {
    const stats = new DocumentStatsManager();

    stats.addDocument(1, 3);
    stats.addDocument("1", 7);

    expect(stats.getLength(1)).toBe(3);
    expect(stats.getLength("1")).toBe(7);
    expect(stats.snapshot()).toEqual([
      { docId: 1, length: 3 },
      { docId: "1", length: 7 },
    ]);
  });
});
