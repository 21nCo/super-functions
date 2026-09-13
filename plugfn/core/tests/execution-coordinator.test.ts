import { describe, it, expect } from 'vitest';
import { createMemoryAtomicKVStore } from '@superfunctions/db/adapters/memory';
import { ExecutionCoordinator } from '../src/core/execution-coordinator.js';
describe('shared workflow execution admission', () => {
  it('admits a single writer across independent coordinators', async () => {
    const store = createMemoryAtomicKVStore(); const a = new ExecutionCoordinator(store); const b = new ExecutionCoordinator(store);
    let release!: () => void; let effects = 0;
    const work = a.run('event', async () => { effects++; await new Promise<void>(resolve => { release = resolve; }); });
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(b.run('event', async () => { effects++; })).rejects.toThrow('IN_PROGRESS');
    release(); await work; expect(effects).toBe(1);
  });
  it('never steals an expired writer; recovery requires its exact token', async () => {
    let now = 0; const store = createMemoryAtomicKVStore(); const a = new ExecutionCoordinator(store, { now: () => now, leaseMs: 10 });
    await expect(a.run('event', async () => { throw new Error('provider timeout'); })).rejects.toThrow('timeout');
    now = 20;
    await expect(new ExecutionCoordinator(store).run('event', async () => 'duplicate')).rejects.toThrow('UNCERTAIN');
    await expect(a.reconcile('event', 'wrong')).rejects.toThrow('CONFLICT');
    await a.reconcile('event', (await a.inspect('event'))!.token);
    expect(await a.run('event', async () => 'reconciled')).toBe('reconciled');
  });
});
