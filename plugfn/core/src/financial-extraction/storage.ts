import {
  type FinancialExtractionRecord,
  type FinancialReviewState,
  validateFinancialExtractionRecord,
} from './types.js';

export interface FinancialExtractionStorage {
  save(record: FinancialExtractionRecord): Promise<void>;
  getByMessageId(messageId: string): Promise<FinancialExtractionRecord | undefined>;
  listByReviewState(reviewState: FinancialReviewState): Promise<FinancialExtractionRecord[]>;
}

export class InMemoryFinancialExtractionStorage implements FinancialExtractionStorage {
  private readonly recordByMessageId = new Map<string, FinancialExtractionRecord>();

  async save(record: FinancialExtractionRecord): Promise<void> {
    const validated = validateFinancialExtractionRecord(record);
    this.recordByMessageId.set(validated.messageId, validated);
  }

  async getByMessageId(messageId: string): Promise<FinancialExtractionRecord | undefined> {
    return this.recordByMessageId.get(messageId);
  }

  async listByReviewState(
    reviewState: FinancialReviewState
  ): Promise<FinancialExtractionRecord[]> {
    return [...this.recordByMessageId.values()].filter((record) => record.reviewState === reviewState);
  }
}
