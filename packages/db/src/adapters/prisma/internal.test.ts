import { describe, expect, it, vi } from 'vitest';
import { createPrismaInternalCrud } from './internal.js';

describe('createPrismaInternalCrud', () => {
  it('uses IS NULL and IS NOT NULL for null equality predicates', async () => {
    const querySpy = vi.fn(async () => []);
    const prisma = {
      $queryRawUnsafe: querySpy,
      $executeRawUnsafe: vi.fn(async () => 0),
    };

    const internal = createPrismaInternalCrud(prisma, 'postgresql');

    await internal.findOne('__datafn_meta', [
      { field: 'deletedAt', op: 'eq', value: null },
    ]);
    expect(querySpy).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM "__datafn_meta" WHERE "deletedAt" IS NULL LIMIT 1',
    );

    await internal.findOne('__datafn_meta', [
      { field: 'deletedAt', op: 'ne', value: null },
    ]);
    expect(querySpy).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM "__datafn_meta" WHERE "deletedAt" IS NOT NULL LIMIT 1',
    );
  });
});
