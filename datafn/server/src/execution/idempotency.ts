/**
 * Idempotency store for mutation deduplication
 */

export interface MutationResult {
  ok: boolean;
  mutationId: string;
  affectedIds: string[];
  errors: Array<{
    code: string;
    message: string;
    path: string;
    retryable: boolean;
  }>;
  deduped: boolean;
}

export interface IdempotencyStore {
  /**
   * Get a previously stored mutation result
   */
  get(clientId: string, mutationId: string): Promise<MutationResult | null>;

  /**
   * Store a mutation result for deduplication
   */
  set(
    clientId: string,
    mutationId: string,
    result: MutationResult
  ): Promise<void>;
}

/**
 * In-memory idempotency store implementation
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private store: Map<string, MutationResult> = new Map();

  private getKey(clientId: string, mutationId: string): string {
    return `${clientId}:${mutationId}`;
  }

  async get(
    clientId: string,
    mutationId: string
  ): Promise<MutationResult | null> {
    return this.store.get(this.getKey(clientId, mutationId)) ?? null;
  }

  async set(
    clientId: string,
    mutationId: string,
    result: MutationResult
  ): Promise<void> {
    this.store.set(this.getKey(clientId, mutationId), result);
  }
}
