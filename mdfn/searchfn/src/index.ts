import type { MdfnDocument } from "@mdfn/core";
import { extractDocument } from "@mdfn/render";

export interface MdfnSearchRecord {
  readonly id: string;
  readonly documentId: string;
  readonly kind: "document" | "chunk";
  readonly ordinal: number;
  readonly text: string;
  readonly headings: readonly string[];
  readonly links: readonly string[];
}

export function createSearchRecords(documentId: string, document: MdfnDocument, maxChunkLength = 1600): readonly MdfnSearchRecord[] {
  const extracted = extractDocument(document, { maxChunkLength });
  const links = extracted.links.map((link) => link.url);
  const namespace = `${documentId.length}:${documentId}`;
  return [
    { id: `document:${namespace}`, documentId, kind: "document", ordinal: 0, text: extracted.plainText, headings: extracted.headings.map((heading) => heading.text), links },
    ...extracted.chunks.map((chunk, index) => ({ id: `chunk:${namespace}:${index}`, documentId, kind: "chunk" as const, ordinal: index, text: chunk.text, headings: chunk.headingPath, links: chunk.links.map((link) => link.url) })),
  ];
}

export const MDFN_SEARCHFN_VERSION = "0.1.0" as const;
