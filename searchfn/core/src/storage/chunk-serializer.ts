import type { TermPosting } from "../cache";
import type { ChunkDecodeResult, ChunkEncodeResult } from "../types";

const JSON_ENCODER = new TextEncoder();
const JSON_DECODER = new TextDecoder();
const POSTING_BIN_V1_MAGIC = new Uint8Array([0x53, 0x46, 0x50, 0x31]);
const FLAG_IS_PREFIX = 0b00000001;
const FLAG_HAS_EXTRA_METADATA = 0b00000010;

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
    const payload = byte & 0x7f;
    if (shift === 28 && payload > 0x0f) {
      throw new Error("Varint decoding overflow");
    }
    result |= payload << shift;
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

  if (encoding === "posting-bin-v1") {
    return {
      postings: decodeTermPostings(view).map((posting) => ({
        docId: posting.docId,
        termFrequency: posting.termFrequency,
        metadata: posting.metadata
      })),
      encoding
    };
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

export function encodeTermPostings(postings: TermPosting[]): ChunkEncodeResult {
  const parts: Uint8Array[] = [];
  let totalLength = POSTING_BIN_V1_MAGIC.length + 4;
  const header = new Uint8Array(totalLength);
  header.set(POSTING_BIN_V1_MAGIC, 0);
  new DataView(header.buffer).setUint32(POSTING_BIN_V1_MAGIC.length, postings.length, true);
  parts.push(header);

  for (const posting of postings) {
    const docIdBytes = JSON_ENCODER.encode(String(posting.docId));
    const { flags, metadataBytes } = encodePostingMetadata(posting.metadata);
    const recordLength = 4 + docIdBytes.length + 4 + 1 + (metadataBytes ? 4 + metadataBytes.length : 0);
    const record = new Uint8Array(recordLength);
    const view = new DataView(record.buffer);

    let offset = 0;
    view.setUint32(offset, docIdBytes.length, true);
    offset += 4;
    record.set(docIdBytes, offset);
    offset += docIdBytes.length;
    view.setUint32(offset, normaliseTermFrequency(posting.termFrequency), true);
    offset += 4;
    record[offset] = flags;
    offset += 1;

    if (metadataBytes) {
      view.setUint32(offset, metadataBytes.length, true);
      offset += 4;
      record.set(metadataBytes, offset);
    }

    totalLength += record.length;
    parts.push(record);
  }

  const buffer = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const part of parts) {
    buffer.set(part, writeOffset);
    writeOffset += part.length;
  }

  return {
    buffer,
    encoding: "posting-bin-v1"
  };
}

function decodeTermPostings(buffer: Uint8Array): TermPosting[] {
  if (buffer.length === 0) {
    return [];
  }
  if (buffer.length < POSTING_BIN_V1_MAGIC.length + 4) {
    throw new Error("Invalid posting-bin-v1 payload");
  }
  for (let index = 0; index < POSTING_BIN_V1_MAGIC.length; index += 1) {
    if (buffer[index] !== POSTING_BIN_V1_MAGIC[index]) {
      throw new Error("Invalid posting-bin-v1 header");
    }
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = POSTING_BIN_V1_MAGIC.length;
  const count = view.getUint32(offset, true);
  offset += 4;

  const postings: TermPosting[] = [];

  for (let index = 0; index < count; index += 1) {
    const docIdLength = view.getUint32(offset, true);
    offset += 4;
    const docIdEnd = offset + docIdLength;
    if (docIdEnd > buffer.length) {
      throw new Error("Invalid posting-bin-v1 docId length");
    }
    const docId = JSON_DECODER.decode(buffer.subarray(offset, docIdEnd));
    offset = docIdEnd;

    if (offset + 5 > buffer.length) {
      throw new Error("Invalid posting-bin-v1 payload length");
    }
    const termFrequency = view.getUint32(offset, true);
    offset += 4;
    const flags = buffer[offset] ?? 0;
    offset += 1;

    let metadata: Record<string, unknown> | undefined =
      flags & FLAG_IS_PREFIX ? { isPrefix: true } : undefined;

    if (flags & FLAG_HAS_EXTRA_METADATA) {
      if (offset + 4 > buffer.length) {
        throw new Error("Invalid posting-bin-v1 metadata length");
      }
      const metadataLength = view.getUint32(offset, true);
      offset += 4;
      const metadataEnd = offset + metadataLength;
      if (metadataEnd > buffer.length) {
        throw new Error("Invalid posting-bin-v1 metadata payload");
      }
      const rawMetadata = JSON_DECODER.decode(buffer.subarray(offset, metadataEnd));
      const parsed = JSON.parse(rawMetadata) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Decoded posting-bin-v1 metadata is not an object");
      }
      metadata = { ...(metadata ?? {}), ...(parsed as Record<string, unknown>) };
      offset = metadataEnd;
    }

    postings.push({
      docId,
      termFrequency: Math.max(1, termFrequency),
      metadata
    });
  }

  if (offset !== buffer.length) {
    throw new Error("Invalid posting-bin-v1 trailing bytes");
  }

  return postings;
}

function encodePostingMetadata(metadata?: Record<string, unknown>): { flags: number; metadataBytes?: Uint8Array } {
  if (!metadata) {
    return { flags: 0 };
  }

  let flags = 0;
  const extraMetadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (key === "isPrefix" && value === true) {
      flags |= FLAG_IS_PREFIX;
      continue;
    }
    extraMetadata[key] = value;
  }

  if (Object.keys(extraMetadata).length > 0) {
    flags |= FLAG_HAS_EXTRA_METADATA;
    return {
      flags,
      metadataBytes: JSON_ENCODER.encode(JSON.stringify(extraMetadata))
    };
  }

  return { flags };
}

function normaliseTermFrequency(termFrequency: number): number {
  if (!Number.isFinite(termFrequency) || termFrequency <= 0) {
    return 1;
  }
  return Math.min(Math.floor(termFrequency), 0xffffffff);
}
