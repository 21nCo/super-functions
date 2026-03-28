import { describe, expect, it } from 'vitest';
import { createDrizzleInternalCrud } from './internal.js';

describe('createDrizzleInternalCrud', () => {
  it('rejects empty create payloads before building SQL', async () => {
    const db = {
      async execute() {
        throw new Error('execute should not be called');
      },
    };

    const internal = createDrizzleInternalCrud(db, 'postgres');

    await expect(internal.create('__datafn_meta', {})).rejects.toThrow(
      'create: data must not be empty',
    );
  });

  it('uses IS NULL and IS NOT NULL for null equality predicates', async () => {
    const executedQueries: any[] = [];
    const db = {
      async execute(query: any) {
        executedQueries.push(query);
        return [];
      },
    };

    const internal = createDrizzleInternalCrud(db, 'postgres');

    await internal.findOne('__datafn_meta', [
      { field: 'deletedAt', op: 'eq', value: null },
    ]);
    expect(JSON.stringify(executedQueries[0]?.queryChunks ?? [])).toContain('IS NULL');

    await internal.findOne('__datafn_meta', [
      { field: 'deletedAt', op: 'ne', value: null },
    ]);
    expect(JSON.stringify(executedQueries[1]?.queryChunks ?? [])).toContain('IS NOT NULL');
  });
});
