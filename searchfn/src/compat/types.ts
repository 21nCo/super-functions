import type {
  SearchOptions,
  AddDocumentInput,
  SearchFnSnapshot,
  WorkerSnapshotPayload
} from "../search-engine";
import type { DocId } from "../types";

export interface FlexIndexOptions {
  cache?: {
    term?: number;
    vector?: number;
  };
  tokenize?: "strict" | "forward" | "full";
  preset?: "match" | "performance" | "memory";
}

export type FlexSearchAddInput = AddDocumentInput;

export interface FlexSearchQueryOptions extends SearchOptions {
  suggest?: boolean;
  field?: string | string[];
}

export interface FlexSearchDocumentHit {
  id: DocId;
  score: number;
  document?: Record<string, unknown>;
}

export interface FlexSearchResult {
  result: DocId[];
  documents?: FlexSearchDocumentHit[];
}

export type FlexSearchSnapshot = SearchFnSnapshot;
export type FlexSearchWorkerSnapshot = WorkerSnapshotPayload;
