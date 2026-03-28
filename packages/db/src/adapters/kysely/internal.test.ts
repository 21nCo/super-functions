import { describe, expect, it } from 'vitest';
import { createKyselyInternalCrud } from './internal.js';

describe('createKyselyInternalCrud', () => {
  it('returns the persisted row using a generated insert id when create data omits id', async () => {
    let executeCount = 0;
    const executor = {
      transformQuery(node: any) {
        return node;
      },
      compileQuery(node: any) {
        return { sql: 'compiled', parameters: [node] };
      },
      async executeQuery() {
        executeCount += 1;
        if (executeCount === 1) {
          return { rows: [], insertId: 7 };
        }
        return { rows: [{ id: 7, value: 'persisted' }] };
      },
    };

    const db = {
      getExecutor() {
        return executor;
      },
      schema: {
        createTable() {
          throw new Error('schema access not expected in this test');
        },
      },
    };

    const internal = createKyselyInternalCrud(db, 'mysql');

    await expect(
      internal.create('__datafn_meta', { value: 'persisted' }),
    ).resolves.toEqual({ id: 7, value: 'persisted' });
    expect(executeCount).toBe(2);
  });

  it('falls back to the input payload when create cannot resolve the persisted row', async () => {
    const executor = {
      transformQuery(node: any) {
        return node;
      },
      compileQuery(node: any) {
        return { sql: 'compiled', parameters: [node] };
      },
      async executeQuery() {
        return { rows: [] };
      },
    };

    const db = {
      getExecutor() {
        return executor;
      },
      schema: {
        createTable() {
          throw new Error('schema access not expected in this test');
        },
      },
    };

    const internal = createKyselyInternalCrud(db, 'mysql');

    await expect(
      internal.create('__datafn_meta', { value: 'persisted' }),
    ).resolves.toEqual({ value: 'persisted' });
  });

  it('rejects empty create payloads before building SQL', async () => {
    const db = {
      schema: {
        createTable() {
          throw new Error('schema access not expected in this test');
        },
      },
    };

    const internal = createKyselyInternalCrud(db, 'postgres');

    await expect(internal.create('__datafn_meta', {})).rejects.toThrow(
      'create: data must not be empty',
    );
  });

  it('uses IS NULL and IS NOT NULL for null equality predicates', async () => {
    const compiledNodes: any[] = [];
    const executor = {
      transformQuery(node: any) {
        return node;
      },
      compileQuery(node: any) {
        compiledNodes.push(node);
        return { sql: 'compiled', parameters: [] };
      },
      async executeQuery() {
        return { rows: [] };
      },
    };

    const db = {
      getExecutor() {
        return executor;
      },
      schema: {
        createTable() {
          throw new Error('schema access not expected in this test');
        },
      },
    };

    const internal = createKyselyInternalCrud(db, 'postgres');

    await internal.findOne('__datafn_meta', [
      { field: 'deletedAt', op: 'eq', value: null },
    ]);
    expect(JSON.stringify(compiledNodes[0])).toContain('IS NULL');

    await internal.findOne('__datafn_meta', [
      { field: 'deletedAt', op: 'ne', value: null },
    ]);
    expect(JSON.stringify(compiledNodes[1])).toContain('IS NOT NULL');
  });

  it('rejects invalid findMany limits before composing SQL', async () => {
    let executed = false;
    const executor = {
      transformQuery(node: any) {
        return node;
      },
      compileQuery(node: any) {
        return { sql: 'compiled', parameters: [node] };
      },
      async executeQuery() {
        executed = true;
        return { rows: [] };
      },
    };

    const db = {
      getExecutor() {
        return executor;
      },
      schema: {
        createTable() {
          throw new Error('schema access not expected in this test');
        },
      },
    };

    const internal = createKyselyInternalCrud(db, 'postgres');

    for (const limit of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      await expect(
        internal.findMany('__datafn_meta', [], { limit }),
      ).rejects.toThrow('findMany: limit must be a non-negative finite number');
    }

    expect(executed).toBe(false);
  });
});
