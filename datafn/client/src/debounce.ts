/**
 * DebouncerMap for per-record-key mutation debouncing (DEB-001)
 *
 * Coalesces rapid mutations with the same debounceKey within a debounce window.
 * Debounce eligibility is selected by the mutation executor.
 */

export interface DfqlMutation {
  resource: string;
  operation: string;
  id: string;
  record?: Record<string, unknown>;
  relations?: Record<string, unknown>;
  mutationId?: string;
  clientId?: string;
  debounceKey?: string;
  debounceMs?: number;
  [key: string]: unknown;
}

interface PendingMutation {
  timer: ReturnType<typeof setTimeout>;
  mutation: DfqlMutation;
  executor: (m: DfqlMutation) => Promise<void>;
  resolve: (value: void) => void;
  reject: (error: unknown) => void;
}

export class DebouncerMap {
  private pending = new Map<string, PendingMutation>();

  private mergeMutation(
    existingMutation: DfqlMutation,
    nextMutation: DfqlMutation,
  ): DfqlMutation {
    const record = nextMutation.record
      ? { ...(existingMutation.record ?? {}), ...nextMutation.record }
      : existingMutation.record;
    const relations = nextMutation.relations
      ? { ...(existingMutation.relations ?? {}), ...nextMutation.relations }
      : existingMutation.relations;

    return {
      ...existingMutation,
      ...nextMutation,
      record,
      relations,
      mutationId: existingMutation.mutationId,
    };
  }

  /**
   * Set a debounced mutation.
   * If a mutation with the same key is already pending, merge the records and reset the timer.
   *
   * @param key - Debounce key (typically record ID)
   * @param mutation - The mutation to debounce
   * @param delayMs - Debounce delay in milliseconds
   * @param executor - Async function to execute the mutation after debounce
   * @returns Promise that resolves when the mutation is executed
   */
  set(
    key: string,
    mutation: DfqlMutation,
    delayMs: number,
    executor: (m: DfqlMutation) => Promise<void>,
  ): Promise<void> {
    // If key already pending, clear existing timer and merge records
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);

      // REL-004: Resolve the old caller's Promise before replacing.
      // Data was merged into the new mutation, so the original caller's mutation is not lost.
      existing.resolve();
      existing.mutation = this.mergeMutation(existing.mutation, mutation);
    }

    return new Promise<void>((resolve, reject) => {
      const mutationToExecute = existing?.mutation || mutation;
      const executorToUse = executor;
      
      const timer = setTimeout(async () => {
        this.pending.delete(key);
        try {
          await executorToUse(mutationToExecute);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, delayMs);

      if (existing) {
        // Update the existing entry with new timer, executor, and resolve/reject
        existing.timer = timer;
        existing.executor = executorToUse;
        existing.resolve = resolve;
        existing.reject = reject;
      } else {
        // Create new entry
        this.pending.set(key, {
          timer,
          mutation: mutationToExecute,
          executor: executorToUse,
          resolve,
          reject,
        });
      }
    });
  }

  /**
   * Flush a specific debounced mutation immediately.
   *
   * @param key - The debounce key to flush. If undefined, does nothing.
   * @returns Promise that resolves when the flushed mutation completes
   */
  async flush(key?: string): Promise<void> {
    if (key === undefined) {
      return;
    }
    
    const pending = this.pending.get(key);
    if (!pending) {
      return; // Nothing to flush
    }
    
    // Clear the timer and remove from pending
    clearTimeout(pending.timer);
    this.pending.delete(key);
    
    // Execute immediately
    try {
      await pending.executor(pending.mutation);
      pending.resolve();
    } catch (err) {
      pending.reject(err);
      throw err; // Re-throw so caller knows it failed
    }
  }

  /**
   * Flush all pending debounced mutations immediately.
   *
   * @returns Promise that resolves when all mutations complete
   */
  async flushAll(): Promise<void> {
    const entries = Array.from(this.pending.entries());
    this.pending.clear();
    
    // Clear all timers first
    for (const [, pending] of entries) {
      clearTimeout(pending.timer);
    }
    
    // Execute all mutations in parallel
    await Promise.allSettled(
      entries.map(async ([, pending]) => {
        try {
          await pending.executor(pending.mutation);
          pending.resolve();
        } catch (err) {
          pending.reject(err);
          // Don't re-throw - the promise is already rejected via pending.reject
        }
      }),
    );
  }

  /**
   * Destroy the debouncer, clearing all timers without executing.
   * Used for cleanup when the client is torn down abruptly.
   */
  destroy(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
  }
}
