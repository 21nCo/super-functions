import type { SearchFnSnapshot } from "./types";

export interface WorkerSnapshotPayload {
  postings: Array<{
    field: string;
    term: string;
    docIds: Array<string | number>;
    termFrequencies: number[];
  }>;
  stats: Array<{ docId: string; length: number }>;
}

export function toWorkerSnapshotPayload(snapshot: SearchFnSnapshot): WorkerSnapshotPayload {
  return {
    postings: snapshot.postings.map((entry) => ({
      field: entry.field,
      term: entry.term,
      docIds: entry.documents.map((doc) => doc.docId) as Array<string | number>,
      termFrequencies: entry.documents.map((doc) => doc.termFrequency)
    })),
    stats: snapshot.stats.map((stat) => ({ ...stat }))
  };
}

export function fromWorkerSnapshotPayload(payload: WorkerSnapshotPayload): SearchFnSnapshot {
  return {
    postings: payload.postings.map((entry) => ({
      field: entry.field,
      term: entry.term,
      documents: entry.docIds.map((docId, index) => ({
        docId,
        termFrequency: entry.termFrequencies[index] ?? 1
      }))
    })),
    stats: payload.stats.map((stat) => ({ ...stat }))
  };
}
