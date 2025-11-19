import type { RetrievedPostingChunk, ScoredDocument } from "./types";
import type { DocId } from "../types";

interface ScoreAccumulator {
  score: number;
}

const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;
const DEFAULT_D = 0.5;
const PREFIX_MATCH_PENALTY = 0.7;

export function scorePostings(
  chunks: RetrievedPostingChunk[],
  documentLengths: Map<DocId, number>,
  averageDocLength: number,
  options?: { k1?: number; b?: number; d?: number }
): ScoredDocument[] {
  const k1 = options?.k1 ?? DEFAULT_K1;
  const b = options?.b ?? DEFAULT_B;
  const d = options?.d ?? DEFAULT_D;
  const scores = new Map<DocId, ScoreAccumulator>();

  for (const chunk of chunks) {
    const idf = chunk.inverseDocumentFrequency ?? computeDefaultIdf(chunk.docFrequency);
    for (const posting of chunk.postings) {
      const docId = posting.docId;
      const docLength = documentLengths.get(docId) ?? averageDocLength;
      const tf = posting.termFrequency;
      const norm = 1 - b + (b * docLength) / Math.max(averageDocLength, 1);
      let scoreContribution = idf * (d + ((k1 + 1) * tf) / (k1 * norm + tf));

      // Apply penalty for prefix matches (n-grams)
      if (posting.metadata?.isPrefix === true) {
        scoreContribution *= PREFIX_MATCH_PENALTY;
      }

      const accumulator = scores.get(docId) ?? { score: 0 };
      accumulator.score += scoreContribution;
      scores.set(docId, accumulator);
    }
  }

  return Array.from(scores.entries())
    .map(([docId, accumulator]) => ({
      docId,
      score: accumulator.score
    }))
    .sort((a, b) => b.score - a.score);
}

function computeDefaultIdf(docFrequency: number): number {
  if (docFrequency <= 0) return 0;
  return Math.log(1 + 1 / docFrequency);
}
