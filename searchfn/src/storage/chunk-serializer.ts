import type { ChunkDecodeResult, ChunkEncodeResult } from "../types";

const JSON_ENCODER = new TextEncoder();
const JSON_DECODER = new TextDecoder();

function encodeVarint(value: number, output: number[]) {
  // Check for values that cannot be safely represented as 32-bit unsigned integers
  if (value > 0xffffffff || value < 0) {
    throw new Error(`Varint encoding overflow: value ${value} exceeds 32-bit unsigned range`);
  }
  let v = value >>> 0;
  while (v >= 0x80) {
    output.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  output.push(v);
}

function decodeVarint(buffer: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;

  while (pos < buffer.length) {
    const byte = buffer[pos];
    result |= (byte & 0x7f) << shift;
    pos += 1;

    if ((byte & 0x80) === 0) {
      return [result >>> 0, pos];
    }

    shift += 7;
    if (shift >= 35) {
      throw new Error("Varint decoding overflow");
    }
  }

  throw new Error("Unexpected end of buffer while decoding varint");
}

function canDeltaEncode(values: (number | string)[]): values is number[] {
  return values.every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0);
}

export function encodePostings(values: (number | string)[]): ChunkEncodeResult {
  if (values.length === 0) {
    return {
      buffer: new Uint8Array(0),
      encoding: "delta-varint"
    };
  }

  if (!canDeltaEncode(values)) {
    const json = JSON.stringify(values);
    return {
      buffer: JSON_ENCODER.encode(json),
      encoding: "json"
    };
  }

  const sorted = [...values] as number[];
  sorted.sort((a, b) => a - b);
  const output: number[] = [];
  let previous = 0;

  try {
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      const delta = index === 0 ? current : current - previous;
      if (delta < 0) {
        throw new Error("Delta encoding received unsorted values");
      }
      encodeVarint(delta, output);
      previous = current;
    }

    return {
      buffer: Uint8Array.from(output),
      encoding: "delta-varint"
    };
  } catch {
    // Fallback to JSON encoding if delta-varint fails (e.g., overflow)
    const json = JSON.stringify(values);
    return {
      buffer: JSON_ENCODER.encode(json),
      encoding: "json"
    };
  }
}

export function decodePostings(buffer: ArrayBuffer, encoding: ChunkEncodeResult["encoding"]): ChunkDecodeResult {
  const view = new Uint8Array(buffer);

  if (encoding === "json") {
    if (view.length === 0) {
      return { postings: [], encoding };
    }
    const json = JSON_DECODER.decode(view);
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Decoded JSON postings payload is not an array");
    }
    return { postings: parsed as Array<number | string>, encoding };
  }

  const postings: number[] = [];
  let offset = 0;
  let previous = 0;

  while (offset < view.length) {
    const [delta, nextOffset] = decodeVarint(view, offset);
    const value = postings.length === 0 ? delta : previous + delta;
    postings.push(value);
    previous = value;
    offset = nextOffset;
  }

  return { postings, encoding };
}
