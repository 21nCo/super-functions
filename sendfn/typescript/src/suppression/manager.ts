import { SendfnDatabaseAdapter, FindSuppressionParams } from '../database/adapter';
import { ValidationError } from '../errors';
import { SuppressionList, AddSuppressionParams, SuppressionCheckResult } from '../types';

export class SuppressionManager {
  constructor(
    private adapter: SendfnDatabaseAdapter,
    private options: { enabled: boolean }
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async checkSuppression(email: string): Promise<SuppressionCheckResult> {
    if (!this.options.enabled) {
        return { suppressed: false };
    }

    const entry = await this.adapter.getSuppressionListEntry(this.normalizeEmail(email));
    if (entry) {
        return {
            suppressed: true,
            entry,
            reason: entry.reason
        };
    }

    return { suppressed: false };
  }

  async addToSuppressionList(params: AddSuppressionParams): Promise<SuppressionList> {
    return this.adapter.addToSuppressionList({
      ...params,
      email: this.normalizeEmail(params.email),
    });
  }

  async removeFromSuppressionList(email: string): Promise<void> {
    return this.adapter.removeFromSuppressionList(this.normalizeEmail(email));
  }

  async bulkAddToSuppressionList(entries: AddSuppressionParams[]): Promise<void> {
    if (entries.length > 1000) {
      throw new ValidationError('Bulk suppression add accepts at most 1000 entries');
    }

    const seen = new Set<string>();

    for (const entry of entries) {
      const normalizedEmail = this.normalizeEmail(entry.email);
      if (seen.has(normalizedEmail)) {
        throw new ValidationError('Duplicate normalized suppression email in bulk add request');
      }

      seen.add(normalizedEmail);
      await this.addToSuppressionList({
        ...entry,
        email: normalizedEmail,
      });
    }
  }

  async exportSuppressionList(limit = 1000, offset = 0): Promise<SuppressionList[]> {
    return this.findSuppressionList({ limit, offset });
  }

  async findSuppressionList(params: FindSuppressionParams): Promise<SuppressionList[]> {
    return this.adapter.findSuppressionList(params);
  }
}
