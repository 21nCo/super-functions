import type { AtomicKVStoreAdapter } from '@superfunctions/db';

interface Claim {
  state: 'idle' | 'running' | 'uncertain';
  token: string;
  expiresAt: number;
}
/** Shared admission control. Expired dispatched work is never automatically replayed. */
export class ExecutionCoordinator {
  private readonly now: () => number;
  constructor(
    private readonly store: AtomicKVStoreAdapter,
    private readonly options: { prefix?: string; leaseMs?: number; now?: () => number } = {}
  ) {
    if (!store.compareAndSet) throw new Error('EXECUTION_ATOMIC_CAS_REQUIRED');
    if (!Number.isFinite(options.leaseMs ?? 60_000) || (options.leaseMs ?? 60_000) <= 0)
      throw new Error('EXECUTION_INVALID_LEASE');
    this.now = options.now ?? Date.now;
  }

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const storageKey = this.key(key);
    const previous = await this.store.get(storageKey);
    const claim: Claim | null = previous ? JSON.parse(previous) : null;
    if (claim?.state === 'running' && claim.expiresAt > this.now())
      throw new Error('EXECUTION_IN_PROGRESS');
    if (claim && claim.state !== 'idle') throw new Error('EXECUTION_OUTCOME_UNCERTAIN');
    const owned: Claim = {
      state: 'running',
      token: crypto.randomUUID(),
      expiresAt: this.now() + (this.options.leaseMs ?? 60_000),
    };
    const serialized = JSON.stringify(owned);
    if (
      !(await this.store.compareAndSet!({ key: storageKey, expected: previous, value: serialized }))
        .updated
    )
      throw new Error('EXECUTION_IN_PROGRESS');
    try {
      const result = await work();
      const released = await this.store.compareAndSet!({
        key: storageKey,
        expected: serialized,
        value: JSON.stringify({ ...owned, state: 'idle' }),
      });
      if (!released.updated) throw new Error('EXECUTION_OWNERSHIP_LOST');
      return result;
    } catch (error) {
      await this.store.compareAndSet!({
        key: storageKey,
        expected: serialized,
        value: JSON.stringify({ ...owned, state: 'uncertain' }),
      });
      throw error;
    }
  }

  async inspect(key: string): Promise<Claim | null> {
    const value = await this.store.get(this.key(key));
    return value ? JSON.parse(value) : null;
  }

  /** Call only after stopping the former worker and reconciling its provider effects/checkpoints. */
  async reconcile(key: string, expectedToken: string): Promise<void> {
    const storageKey = this.key(key);
    const value = await this.store.get(storageKey);
    const claim: Claim | null = value ? JSON.parse(value) : null;
    if (
      !claim ||
      claim.token !== expectedToken ||
      claim.state === 'idle' ||
      (claim.state === 'running' && claim.expiresAt > this.now())
    )
      throw new Error('EXECUTION_RECONCILIATION_CONFLICT');
    if (
      !(
        await this.store.compareAndSet!({
          key: storageKey,
          expected: value,
          value: JSON.stringify({ ...claim, state: 'idle' }),
        })
      ).updated
    )
      throw new Error('EXECUTION_RECONCILIATION_CONFLICT');
  }

  private key(value: string) {
    if (!value) throw new Error('EXECUTION_KEY_REQUIRED');
    return `${this.options.prefix ?? 'plugfn:execution:'}${value}`;
  }
}
