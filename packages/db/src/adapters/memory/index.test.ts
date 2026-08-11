import { describe, expect, it } from 'vitest';
import { memoryAdapter } from './index.js';

describe('memoryAdapter transactions', () => {
  it('commits successful writes and rolls back a failed callback', async () => {
    const adapter = memoryAdapter({ debug: false });

    await adapter.transaction(async (transaction) => {
      await transaction.create({
        model: 'records',
        data: { id: 'committed', value: 1 }
      });
    });

    await expect(
      adapter.transaction(async (transaction) => {
        await transaction.update({
          model: 'records',
          where: [{ field: 'id', operator: 'eq', value: 'committed' }],
          data: { value: 2 }
        });
        await transaction.create({
          model: 'records',
          data: { id: 'rolled-back', value: 3 }
        });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');

    await expect(
      adapter.findOne<{ value: number }>({
        model: 'records',
        where: [{ field: 'id', operator: 'eq', value: 'committed' }]
      })
    ).resolves.toMatchObject({ value: 1 });
    await expect(
      adapter.findOne({
        model: 'records',
        where: [{ field: 'id', operator: 'eq', value: 'rolled-back' }]
      })
    ).resolves.toBeNull();
  });

  it('does not erase an external write when a concurrent transaction rolls back', async () => {
    const adapter = memoryAdapter({ debug: false });
    let notifyTransactionStarted!: () => void;
    let releaseTransaction!: () => void;
    const transactionStarted = new Promise<void>((resolve) => {
      notifyTransactionStarted = resolve;
    });
    const transactionGate = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });

    const failedTransaction = adapter.transaction(async (transaction) => {
      await transaction.create({
        model: 'records',
        data: { id: 'rolled-back', value: 1 }
      });
      notifyTransactionStarted();
      await transactionGate;
      throw new Error('rollback');
    });
    await transactionStarted;

    const externalWrite = adapter.create({
      model: 'records',
      data: { id: 'external', value: 2 }
    });
    releaseTransaction();

    await expect(failedTransaction).rejects.toThrow('rollback');
    await expect(externalWrite).resolves.toMatchObject({ id: 'external', value: 2 });
    await expect(
      adapter.findOne({
        model: 'records',
        where: [{ field: 'id', operator: 'eq', value: 'rolled-back' }]
      })
    ).resolves.toBeNull();
  });

  it('rolls back transaction-bound internal CRUD mutations', async () => {
    const adapter = memoryAdapter({ debug: false });
    await adapter.internal.ensureTable('__datafn_records', [
      { name: 'id', type: 'text', primaryKey: true }
    ]);
    await adapter.internal.create('__datafn_records', { id: 'committed', value: 1 });

    await expect(
      adapter.transaction(async (transaction) => {
        await transaction.internal.update(
          '__datafn_records',
          [{ field: 'id', op: 'eq', value: 'committed' }],
          { value: 2 }
        );
        await transaction.internal.create('__datafn_records', { id: 'rolled-back', value: 3 });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');

    await expect(
      adapter.internal.findOne('__datafn_records', [{ field: 'id', op: 'eq', value: 'committed' }])
    ).resolves.toMatchObject({ value: 1 });
    await expect(
      adapter.internal.findOne('__datafn_records', [{ field: 'id', op: 'eq', value: 'rolled-back' }])
    ).resolves.toBeNull();
  });
});
