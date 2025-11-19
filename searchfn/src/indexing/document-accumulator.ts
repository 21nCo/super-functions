import type { DocId } from "../types";
import type { Token } from "../pipeline";

export interface FieldStatistics {
  termFrequencies: Map<string, number>;
  termMetadata: Map<string, Record<string, unknown>>;
  length: number;
}

export interface DocumentStatistics {
  docId: DocId;
  fields: Map<string, FieldStatistics>;
}

export class DocumentAccumulator {
  private readonly fieldStats: Map<string, FieldStatistics> = new Map();

  constructor(private readonly docId: DocId) {}

  addToken(token: Token): void {
    if (!token.value) return;
    const fieldEntry = this.ensureField(token.field);
    const current = fieldEntry.termFrequencies.get(token.value) ?? 0;
    fieldEntry.termFrequencies.set(token.value, current + 1);
    fieldEntry.length += 1;
    
    // Store metadata for the term (only if present and not already stored)
    if (token.metadata && !fieldEntry.termMetadata.has(token.value)) {
      fieldEntry.termMetadata.set(token.value, token.metadata);
    }
  }

  toDocumentStatistics(): DocumentStatistics {
    return {
      docId: this.docId,
      fields: this.fieldStats
    };
  }

  private ensureField(field: string): FieldStatistics {
    let entry = this.fieldStats.get(field);
    if (!entry) {
      entry = {
        termFrequencies: new Map<string, number>(),
        termMetadata: new Map<string, Record<string, unknown>>(),
        length: 0
      };
      this.fieldStats.set(field, entry);
    }
    return entry;
  }
}
