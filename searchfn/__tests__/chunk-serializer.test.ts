import { describe, expect, it } from "vitest";
import { decodePostings, encodePostings } from "../src/storage/chunk-serializer";

describe("chunk serializer", () => {
  it("encodes and decodes numeric postings using delta-varint", () => {
    const sample = [3, 10, 11, 25, 26];
    const { buffer, encoding } = encodePostings(sample);
    expect(encoding).toBe("delta-varint");
    expect(buffer.length).toBeGreaterThan(0);

    const decoded = decodePostings(buffer.buffer, encoding);
    expect(decoded.encoding).toBe("delta-varint");
    expect(decoded.postings).toEqual(sample);
  });

  it("falls back to JSON encoding when encountering strings", () => {
    const sample = ["doc-1", "doc-2"];
    const { buffer, encoding } = encodePostings(sample);
    expect(encoding).toBe("json");

    const decoded = decodePostings(buffer.buffer, encoding);
    expect(decoded.encoding).toBe("json");
    expect(decoded.postings).toEqual(sample);
  });

  it("returns empty results for empty inputs", () => {
    const { buffer, encoding } = encodePostings([]);
    expect(buffer.length).toBe(0);
    expect(encoding).toBe("delta-varint");

    const decoded = decodePostings(buffer.buffer, encoding);
    expect(decoded.postings).toEqual([]);
  });
});
