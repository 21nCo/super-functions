import type { TermPosting } from "../cache";

export interface SearchFnSnapshot {
  postings: Array<{
    field: string;
    term: string;
    documents: TermPosting[];
  }>;
  stats: Array<{ docId: string; length: number }>;
}

export interface AddDocumentOptions {
  /**
   * Whether to persist changes immediately to IndexedDB.
   * Default: true (backward compatible)
   * Set to false for bulk operations, then call flush() manually.
   */
  persist?: boolean;
}

export interface BulkAddOptions {
  /**
   * Batch size for progress reporting.
   * Default: 100
   */
  batchSize?: number;
  /**
   * Progress callback fired after each batch.
   */
  onProgress?: (indexed: number, total: number) => void;
  // Adaptive memory management
  adaptiveBatching?: boolean;  // Default: false (opt-in)
  maxMemoryMB?: number;         // Default: 50MB
  minBatchSize?: number;        // Default: 10
  maxBatchSize?: number;        // Default: 1000
  // Streaming progress
  streamingProgress?: boolean;  // Report progress per document instead of per batch
  progressInterval?: number;    // Report every N documents (default: 10)
}

export interface BulkIndexingCheckpoint {
  processedCount: number;
  lastSuccessfulBatch: number;
  failedDocuments: Array<{
    index: number;
    docId: string;
    error: string;
  }>;
  timestamp: number;
}

export interface BulkAddOptionsWithRecovery extends BulkAddOptions {
  enableCheckpointing?: boolean;
  checkpointInterval?: number;  // Flush every N documents (default: 1000)
  onCheckpoint?: (checkpoint: BulkIndexingCheckpoint) => void;
  continueOnError?: boolean;    // Continue processing after errors (default: true)
}
