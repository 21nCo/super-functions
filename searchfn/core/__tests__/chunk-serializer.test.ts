import { describe, expect, it } from "vitest";
import { decodePostings, encodePostings, encodeTermPostings } from "../src/storage/chunk-serializer";

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

  it("rejects oversized 5-byte varints instead of wrapping them", () => {
    const malformed = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x10]);
    expect(() => decodePostings(malformed.buffer, "delta-varint")).toThrow("Varint decoding overflow");
  });

  it("encodes and decodes structured postings using posting-bin-v1", () => {
    const { buffer, encoding } = encodeTermPostings([
      { docId: "doc-1", termFrequency: 2, metadata: { isPrefix: true } },
      { docId: 42, termFrequency: 4, metadata: { section: "intro" } },
      { docId: "doc-3", termFrequency: 1, metadata: { isPrefix: true, language: "en" } },
      { docId: "doc-4", termFrequency: 0.5, metadata: {} }
    ]);

    expect(encoding).toBe("posting-bin-v1");

    const decoded = decodePostings(buffer.buffer, encoding);
    expect(decoded.encoding).toBe("posting-bin-v1");
    expect(decoded.postings).toEqual([
      { docId: "doc-1", termFrequency: 2, metadata: { isPrefix: true } },
      { docId: "42", termFrequency: 4, metadata: { section: "intro" } },
      { docId: "doc-3", termFrequency: 1, metadata: { isPrefix: true, language: "en" } },
      { docId: "doc-4", termFrequency: 1, metadata: {} }
    ]);
  });

  it("rejects posting-bin-v1 payloads that end before the next docId length", () => {
    const malformed = new Uint8Array([
      0x53, 0x46, 0x50, 0x31,
      0x01, 0x00, 0x00, 0x00,
      0xff, 0xff
    ]);

    expect(() => decodePostings(malformed.buffer, "posting-bin-v1")).toThrow("Invalid posting-bin-v1 payload length");
  });
});
