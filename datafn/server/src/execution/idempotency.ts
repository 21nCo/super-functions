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

interface StoredEntry {
  result: MutationResult;
  createdAt: number;
}

/**
 * SCA-004: In-memory idempotency store with TTL sweep + LRU eviction.
 *
 * - Entries have a `createdAt` timestamp.
 * - A sweep timer (5 min) evicts entries older than `ttlMs`.
 * - Map insertion order used for LRU: on `get()`, delete+re-insert to move to end.
 * - On `set()`: if `size >= maxEntries`, delete oldest entry (first Map entry).
 * - `destroy()` clears the sweep timer.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private store: Map<string, StoredEntry> = new Map();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private ttlMs: number;
  private maxEntries: number;

  constructor(opts: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs = opts.ttlMs ?? 86_400_000; // 24 hours
    this.maxEntries = opts.maxEntries ?? 100_000;

    // Start sweep timer (every 5 minutes)
    this.sweepTimer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    // Unref so it doesn't keep the process alive
    if (this.sweepTimer && typeof this.sweepTimer === "object" && "unref" in this.sweepTimer) {
      (this.sweepTimer as NodeJS.Timeout).unref();
    }
  }

  private getKey(clientId: string, mutationId: string): string {
    return `${clientId}:${mutationId}`;
  }

  async get(
    clientId: string,
    mutationId: string
  ): Promise<MutationResult | null> {
    const key = this.getKey(clientId, mutationId);
    const entry = this.store.get(key);
    if (!entry) return null;

    // LRU: move to end by deleting and re-inserting
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.result;
  }

  async set(
    clientId: string,
    mutationId: string,
    result: MutationResult
  ): Promise<void> {
    const key = this.getKey(clientId, mutationId);

    // EXE-006: Prevent overwriting an existing result (race condition guard)
    if (this.store.has(key)) return;

    // LRU eviction: if at capacity, remove oldest entry (first Map entry)
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }

    this.store.set(key, {
      result,
      createdAt: Date.now(),
    });
  }

  /**
   * TTL sweep: remove entries older than ttlMs
   */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clean up the sweep timer. Call when shutting down.
   */
  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Visible for testing */
  get size(): number {
    return this.store.size;
  }
}
