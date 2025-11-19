import type { DocId } from "../types";
import type { Pipeline } from "../pipeline";
import { PipelineEngine } from "../pipeline";
import { DocumentAccumulator } from "./document-accumulator";

export interface IndexingInputRecord {
  docId: DocId;
  fields: Record<string, string>;
}

export interface IngestedDocument {
  docId: DocId;
  fieldFrequencies: Map<string, Map<string, number>>;
  fieldMetadata: Map<string, Map<string, Record<string, unknown>>>;
  fieldLengths: Map<string, number>;
  totalLength: number;
}

export class Indexer {
  private readonly pipeline: Pipeline;

  constructor(pipeline?: Pipeline) {
    this.pipeline = pipeline ?? new PipelineEngine();
  }

  ingest(record: IndexingInputRecord): IngestedDocument {
    const accumulator = new DocumentAccumulator(record.docId);

    for (const [field, text] of Object.entries(record.fields)) {
      if (!text) continue;
      const tokens = this.pipeline.run(field, text, record.docId);
      for (const token of tokens) {
        accumulator.addToken(token);
      }
    }

    return this.convertAccumulatorToDocument(accumulator);
  }

  /**
   * Batch ingest documents with token caching for repeated field values.
   * Significantly faster when documents share common field values (categories, tags, etc.)
   * 
   * @param records - Array of documents to ingest
   * @returns Array of ingested documents with term frequencies and metadata
   */
  ingestBatch(records: IndexingInputRecord[]): IngestedDocument[] {
    // Token cache: Map<field, Map<text, tokens>>
    const tokenCache = new Map<string, Map<string, import("../pipeline").Token[]>>();
    
    // Phase 1: Collect unique field values and tokenize once
    for (const record of records) {
      for (const [field, text] of Object.entries(record.fields)) {
        if (!text) continue;
        
        let fieldCache = tokenCache.get(field);
        if (!fieldCache) {
          fieldCache = new Map();
          tokenCache.set(field, fieldCache);
        }
        
        // Only tokenize if not already cached
        if (!fieldCache.has(text)) {
          fieldCache.set(text, this.pipeline.run(field, text, record.docId));
        }
      }
    }
    
    // Phase 2: Build documents using cached tokens
    const results: IngestedDocument[] = [];
    
    for (const record of records) {
      const accumulator = new DocumentAccumulator(record.docId);
      
      for (const [field, text] of Object.entries(record.fields)) {
        if (!text) continue;
        const tokens = tokenCache.get(field)?.get(text) ?? [];
        for (const token of tokens) {
          accumulator.addToken(token);
        }
      }
      
      results.push(this.convertAccumulatorToDocument(accumulator));
    }
    
    return results;
  }

  /**
   * Convert accumulator to IngestedDocument (shared by ingest and ingestBatch)
   */
  private convertAccumulatorToDocument(accumulator: DocumentAccumulator): IngestedDocument {
    const stats = accumulator.toDocumentStatistics();
    const fieldFrequencies = new Map<string, Map<string, number>>();
    const fieldMetadata = new Map<string, Map<string, Record<string, unknown>>>();
    const fieldLengths = new Map<string, number>();
    let totalLength = 0;

    stats.fields.forEach((value, field) => {
      const frequencies = new Map<string, number>();
      value.termFrequencies.forEach((frequency, term) => {
        const numericFrequency = Number(frequency);
        const termFrequency = Number.isFinite(numericFrequency) && numericFrequency > 0 ? numericFrequency : 1;
        frequencies.set(term, termFrequency);
      });
      fieldFrequencies.set(field, frequencies);
      fieldMetadata.set(field, value.termMetadata);
      fieldLengths.set(field, value.length);
      totalLength += value.length;
    });

    return {
      docId: stats.docId,
      fieldFrequencies,
      fieldMetadata,
      fieldLengths,
      totalLength
    };
  }
}
