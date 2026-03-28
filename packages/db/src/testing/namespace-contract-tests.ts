/**
 * Reusable contract test suite for row-level namespace isolation.
 *
 * Any adapter implementation can call `runRowLevelNamespaceContractTests`
 * inside a vitest `describe` block to verify that, when wrapped with
 * `wrapWithRowLevelNamespace`, the adapter properly isolates data between
 * namespaces.
 *
 * Covers: TST-001, RLN-001 through RLN-012
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { wrapWithRowLevelNamespace, NamespaceRequiredError } from '../adapter/row-level-namespace.js';
import { NotFoundError } from '../adapter/errors.js';
import type { Adapter } from '../adapter/types.js';

/**
 * Run the full row-level namespace isolation contract test suite.
 *
 * @param getBaseAdapter - factory that returns a *fresh* unwrapped adapter for
 *   each test run. Called inside `beforeEach` so every test starts clean.
 */
export function runRowLevelNamespaceContractTests(
  getBaseAdapter: () => Adapter,
) {
  let baseAdapter: Adapter;
  let db: Adapter;

  const NS_A = 'user:alice';
  const NS_B = 'user:bob';
  const COL = '__ns';

  beforeEach(() => {
    baseAdapter = getBaseAdapter();
    db = wrapWithRowLevelNamespace(baseAdapter, {
      enabled: true,
      columnName: COL,
      mandatory: true,
    });
  });

  // =========================================================================
  // Helpers
  // =========================================================================

  async function seedTwoNamespaces() {
    await db.create({ model: 'task', data: { id: 'a1', title: 'Alice 1' }, namespace: NS_A });
    await db.create({ model: 'task', data: { id: 'a2', title: 'Alice 2' }, namespace: NS_A });
    await db.create({ model: 'task', data: { id: 'b1', title: 'Bob 1' }, namespace: NS_B });
  }

  // =========================================================================
  // Read isolation
  // =========================================================================

  describe('read isolation (RLN-001)', () => {
    beforeEach(seedTwoNamespaces);

    it('findMany returns only namespace A records for user A', async () => {
      const results = await db.findMany({ model: 'task', where: [], namespace: NS_A });
      expect(results).toHaveLength(2);
      expect(results.map((r: any) => r.id).sort()).toEqual(['a1', 'a2']);
    });

    it('findMany returns only namespace B records for user B', async () => {
      const results = await db.findMany({ model: 'task', where: [], namespace: NS_B });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 'b1' });
    });

    it('findOne respects namespace boundary', async () => {
      const found = await db.findOne({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 'b1' }],
        namespace: NS_A,
      });
      expect(found).toBeNull();
    });

    it('findMany composes namespace filter with user WHERE', async () => {
      const results = await db.findMany({
        model: 'task',
        where: [{ field: 'title', operator: 'eq', value: 'Alice 1' }],
        namespace: NS_A,
      });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 'a1' });
    });

    it('count only counts records in the given namespace', async () => {
      expect(await db.count({ model: 'task', namespace: NS_A })).toBe(2);
      expect(await db.count({ model: 'task', namespace: NS_B })).toBe(1);
    });
  });

  // =========================================================================
  // Write stamping
  // =========================================================================

  describe('write stamping (RLN-002)', () => {
    it('create stamps __ns on the record', async () => {
      await db.create({ model: 'task', data: { id: 't1', title: 'Test' }, namespace: NS_A });

      const raw = await baseAdapter.findMany({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 't1' }],
      });
      expect(raw[0]).toMatchObject({ [COL]: NS_A });
    });

    it('createMany stamps every record', async () => {
      await db.createMany({
        model: 'task',
        data: [{ id: 't1' }, { id: 't2' }],
        namespace: NS_A,
      });

      const raw = await baseAdapter.findMany({ model: 'task', where: [] });
      expect(raw).toHaveLength(2);
      for (const r of raw) {
        expect(r[COL]).toBe(NS_A);
      }
    });
  });

  // =========================================================================
  // Output stripping
  // =========================================================================

  describe('output stripping (RLN-004)', () => {
    beforeEach(seedTwoNamespaces);

    it('findMany strips __ns from returned records', async () => {
      const results = await db.findMany({ model: 'task', where: [], namespace: NS_A });
      for (const r of results) {
        expect(r).not.toHaveProperty(COL);
      }
    });

    it('findOne strips __ns from returned record', async () => {
      const result = await db.findOne({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 'a1' }],
        namespace: NS_A,
      });
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty(COL);
    });

    it('create strips __ns from returned record', async () => {
      const result = await db.create({
        model: 'task',
        data: { id: 'x1', title: 'Stripped' },
        namespace: NS_A,
      });
      expect(result).not.toHaveProperty(COL);
    });

    it('update strips __ns from returned record', async () => {
      const result = await db.update({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 'a1' }],
        data: { title: 'Updated' },
        namespace: NS_A,
      });
      expect(result).not.toHaveProperty(COL);
    });

    it('upsert strips __ns from returned record', async () => {
      const result = await db.upsert({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 'a1' }],
        create: { id: 'a1', title: 'New' },
        update: { title: 'Upserted' },
        namespace: NS_A,
      });
      expect(result).not.toHaveProperty(COL);
    });
  });

  // =========================================================================
  // Mutation isolation
  // =========================================================================

  describe('mutation isolation (RLN-001, RLN-005)', () => {
    beforeEach(seedTwoNamespaces);

    it('update as A does not affect B records', async () => {
      await expect(
        db.update({
          model: 'task',
          where: [{ field: 'id', operator: 'eq', value: 'b1' }],
          data: { title: 'Hacked' },
          namespace: NS_A,
        }),
      ).rejects.toMatchObject({ name: NotFoundError.name });

      // Verify b1 unchanged
      const raw = await baseAdapter.findMany({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 'b1' }],
      });
      expect(raw[0].title).toBe('Bob 1');
    });

    it('updateMany as A does not affect B records', async () => {
      const affected = await db.updateMany({
        model: 'task',
        where: [],
        data: { title: 'All Mine' },
        namespace: NS_A,
      });
      expect(affected).toBe(2);

      // B record unchanged
      const raw = await baseAdapter.findMany({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 'b1' }],
      });
      expect(raw[0].title).toBe('Bob 1');
    });

    it('delete as A does not affect B records', async () => {
      await db.delete({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 'b1' }],
        namespace: NS_A,
      });

      const bRecords = await db.findMany({ model: 'task', where: [], namespace: NS_B });
      expect(bRecords).toHaveLength(1);
      expect(bRecords[0]).toMatchObject({ id: 'b1' });
    });

    it('deleteMany as A does not affect B records', async () => {
      const deleted = await db.deleteMany({
        model: 'task',
        where: [],
        namespace: NS_A,
      });
      expect(deleted).toBe(2);

      const bRecords = await db.findMany({ model: 'task', where: [], namespace: NS_B });
      expect(bRecords).toHaveLength(1);
    });
  });

  // =========================================================================
  // Namespace immutability
  // =========================================================================

  describe('namespace immutability (RLN-005)', () => {
    it('update strips __ns from data — cannot change namespace', async () => {
      await db.create({ model: 'task', data: { id: 't1', title: 'Old' }, namespace: NS_A });

      await db.update({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 't1' }],
        data: { title: 'New', [COL]: NS_B },
        namespace: NS_A,
      });

      const raw = await baseAdapter.findMany({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 't1' }],
      });
      expect(raw[0][COL]).toBe(NS_A);
    });
  });

  // =========================================================================
  // Mandatory namespace enforcement
  // =========================================================================

  describe('mandatory namespace enforcement (RLN-003)', () => {
    it('throws NAMESPACE_REQUIRED for findMany without namespace', async () => {
      await expect(
        db.findMany({ model: 'task', where: [] }),
      ).rejects.toThrow(NamespaceRequiredError);
    });

    it('throws NAMESPACE_REQUIRED for create without namespace', async () => {
      await expect(
        db.create({ model: 'task', data: { id: 'x' } }),
      ).rejects.toThrow(NamespaceRequiredError);
    });

    it('throws NAMESPACE_REQUIRED for empty string namespace', async () => {
      await expect(
        db.create({ model: 'task', data: { id: 'x' }, namespace: '' }),
      ).rejects.toThrow(NamespaceRequiredError);
    });

    it('error has code NAMESPACE_REQUIRED', async () => {
      try {
        await db.findMany({ model: 'task', where: [] });
        expect.unreachable('should have thrown');
      } catch (e: any) {
        expect(e.code).toBe('NAMESPACE_REQUIRED');
      }
    });
  });

  // =========================================================================
  // Upsert dual injection
  // =========================================================================

  describe('upsert dual injection (RLN-008)', () => {
    it('stamps __ns in create data for new record', async () => {
      await db.upsert({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 't1' }],
        create: { id: 't1', title: 'New' },
        update: { title: 'Updated' },
        namespace: NS_A,
      });

      const raw = await baseAdapter.findMany({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 't1' }],
      });
      expect(raw[0][COL]).toBe(NS_A);
    });

    it('does not inject __ns into update data', async () => {
      await db.create({ model: 'task', data: { id: 't1', title: 'Orig' }, namespace: NS_A });

      await db.upsert({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 't1' }],
        create: { id: 't1', title: 'New' },
        update: { title: 'Upserted', [COL]: NS_B },
        namespace: NS_A,
      });

      const raw = await baseAdapter.findMany({
        model: 'task',
        where: [{ field: 'id', operator: 'eq', value: 't1' }],
      });
      expect(raw[0][COL]).toBe(NS_A);
      expect(raw[0].title).toBe('Upserted');
    });
  });

  // =========================================================================
  // Internal CRUD exemption
  // =========================================================================

  describe('internal CRUD exemption (RLN-006)', () => {
    it('db.internal works without namespace injection or error', async () => {
      await db.internal.ensureTable('__datafn_meta', [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'value', type: 'text' },
      ]);

      await db.internal.create('__datafn_meta', { id: 'k1', value: 'v1' });

      const results = await db.internal.findMany('__datafn_meta', [
        { field: 'id', op: 'eq', value: 'k1' },
      ]);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 'k1', value: 'v1' });
    });
  });

  // =========================================================================
  // Disabled mode
  // =========================================================================

  describe('disabled mode (RLN-012)', () => {
    let disabledDb: Adapter;

    beforeEach(() => {
      disabledDb = wrapWithRowLevelNamespace(getBaseAdapter(), { enabled: false });
    });

    it('returns all records regardless of namespace', async () => {
      await disabledDb.create({ model: 'task', data: { id: 't1' } });
      await disabledDb.create({ model: 'task', data: { id: 't2' } });

      const results = await disabledDb.findMany({ model: 'task', where: [] });
      expect(results).toHaveLength(2);
    });

    it('does not throw on missing namespace', async () => {
      await expect(disabledDb.findMany({ model: 'task', where: [] })).resolves.toEqual([]);
    });
  });
}
