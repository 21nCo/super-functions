import { describe, expect, it } from "vitest";
import { encodePostings, decodePostings } from "../src";

describe("public API exports", () => {
  it("exposes encode/decode helpers via root entry", () => {
    const sample = [1, 5, 9];
    const { buffer, encoding } = encodePostings(sample);
    const decoded = decodePostings(buffer.buffer, encoding);
    expect(decoded.postings).toEqual(sample);
  });
});
