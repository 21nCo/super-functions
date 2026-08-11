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
});
