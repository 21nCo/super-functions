import type { DocId } from "../types";
import type { DocumentStatsProvider } from "./types";

export class DocumentStatsManager implements DocumentStatsProvider {
  private readonly lengths = new Map<DocId, number>();
  private totalLength = 0;
  private documentCount = 0;

  addDocument(docId: DocId, totalLength: number): void {
    const existing = this.lengths.get(docId);

    if (existing !== undefined) {
      this.totalLength -= existing;
    } else {
      this.documentCount += 1;
    }

    this.lengths.set(docId, totalLength);
    this.totalLength += totalLength;
  }

  removeDocument(docId: DocId): void {
    const existing = this.lengths.get(docId);
    if (existing === undefined) return;

    this.lengths.delete(docId);
    this.totalLength -= existing;
    this.documentCount = Math.max(this.documentCount - 1, 0);
  }

  getLength(docId: DocId): number | undefined {
    return this.lengths.get(docId);
  }

  getAverageLength(): number {
    if (this.documentCount === 0) {
      return 1;
    }
    return this.totalLength / this.documentCount;
  }

  snapshot(): Array<{ docId: DocId; length: number }> {
    return Array.from(this.lengths.entries()).map(([docId, length]) => ({
      docId,
      length
    }));
  }

  load(entries: Array<{ docId: DocId; length: number }>): void {
    this.lengths.clear();
    this.totalLength = 0;
    this.documentCount = 0;
    for (const entry of entries) {
      this.addDocument(entry.docId, entry.length);
    }
  }
}
