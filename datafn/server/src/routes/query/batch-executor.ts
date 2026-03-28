/**
 * FIX-SRV-005: Batch query orchestration module
 * Extracted from routes/query.ts — single responsibility: bounded concurrency execution
 */

/**
 * FIX-SRV-003: Run tasks with bounded concurrency.
 * At most `concurrency` tasks execute simultaneously; excess tasks are queued.
 */
export async function runBounded<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  const effectiveConcurrency = tasks.length === 0 ? 0 : Math.max(1, concurrency);

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from(
    { length: Math.min(effectiveConcurrency, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
