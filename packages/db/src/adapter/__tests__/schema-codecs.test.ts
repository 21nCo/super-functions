import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../adapters/memory/index.ts';
import type { TableSchemaMap } from '../types.ts';
import {
  transformRecordForRuntime,
  transformRecordForStorage,
  transformWhereForStorage,
  wrapWithSchema,
} from '../schema-codecs.ts';

const schema: TableSchemaMap = {
  events: {
    modelName: 'events',
    fields: {
      id: { type: 'string', required: true },
      happenedAt: {
        type: 'datetime',
        required: true,
        dateValueType: 'date',
        dateStorageType: 'timestamptz',
      },
      deliveredAt: {
        type: 'datetime',
        required: true,
        dateValueType: 'iso-string',
        dateStorageType: 'timestamptz',
      },
      countedAt: {
        type: 'datetime',
        required: true,
        dateValueType: 'epoch-ms',
        dateStorageType: 'epoch-ms-bigint',
      },
    },
  },
};

describe('schema date codecs', () => {
  it('converts records to the configured storage and runtime date shapes', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    const stored = transformRecordForStorage(schema, 'events', {
      id: 'evt_1',
      happenedAt: iso,
      deliveredAt: iso,
      countedAt: iso,
    });

    expect(stored.happenedAt).toBeInstanceOf(Date);
    expect(stored.deliveredAt).toBeInstanceOf(Date);
    expect(stored.countedAt).toBe(Date.parse(iso));

    const runtime = transformRecordForRuntime(schema, 'events', stored) as {
      happenedAt: Date;
      deliveredAt: string;
      countedAt: number;
    };
    expect(runtime.happenedAt).toBeInstanceOf(Date);
    expect(runtime.happenedAt.toISOString()).toBe(iso);
    expect(runtime.deliveredAt).toBe(iso);
    expect(runtime.countedAt).toBe(Date.parse(iso));
  });

  it('converts date where clauses, including arrays', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    const where = transformWhereForStorage(schema, 'events', [
      { field: 'happenedAt', operator: 'gte', value: iso },
      { field: 'deliveredAt', operator: 'in', value: [iso] },
      { field: 'countedAt', operator: 'lt', value: iso },
    ]);

    expect(where?.[0]?.value).toBeInstanceOf(Date);
    expect((where?.[1]?.value as unknown[])[0]).toBeInstanceOf(Date);
    expect(where?.[2]?.value).toBe(Date.parse(iso));
  });

  it('wraps adapters with schema codecs', async () => {
    const iso = '2026-01-01T00:00:00.000Z';
    const base = memoryAdapter({ debug: false });
    const db = wrapWithSchema(base, schema);

    const created = await db.create<{
      happenedAt: Date;
      deliveredAt: string;
      countedAt: number;
    }>({
      model: 'events',
      data: {
        id: 'evt_1',
        happenedAt: iso,
        deliveredAt: iso,
        countedAt: iso,
      },
    });

    expect(created.happenedAt).toBeInstanceOf(Date);
    expect(created.deliveredAt).toBe(iso);
    expect(created.countedAt).toBe(Date.parse(iso));

    const raw = await base.findOne<Record<string, unknown>>({
      model: 'events',
      where: [{ field: 'id', operator: 'eq', value: 'evt_1' }],
    });
    expect(raw?.happenedAt).toBeInstanceOf(Date);
    expect(raw?.deliveredAt).toBeInstanceOf(Date);
    expect(raw?.countedAt).toBe(Date.parse(iso));

    const found = await db.findOne<{ happenedAt: Date; deliveredAt: string; countedAt: number }>({
      model: 'events',
      where: [{ field: 'countedAt', operator: 'eq', value: iso }],
    });
    expect(found?.happenedAt).toBeInstanceOf(Date);
    expect(found?.deliveredAt).toBe(iso);
  });

  it('allows adapters to receive schema directly', async () => {
    const iso = '2026-01-01T00:00:00.000Z';
    const db = memoryAdapter({ debug: false, adapterSchema: schema });

    await db.create({
      model: 'events',
      data: {
        id: 'evt_1',
        happenedAt: iso,
        deliveredAt: iso,
        countedAt: iso,
      },
    });

    const found = await db.findOne<{ happenedAt: Date; deliveredAt: string; countedAt: number }>({
      model: 'events',
      where: [{ field: 'id', operator: 'eq', value: 'evt_1' }],
    });

    expect(found?.happenedAt).toBeInstanceOf(Date);
    expect(found?.deliveredAt).toBe(iso);
    expect(found?.countedAt).toBe(Date.parse(iso));
  });

  it('rejects invalid date values', () => {
    expect(() =>
      transformRecordForStorage(schema, 'events', {
        id: 'evt_1',
        happenedAt: 'not-a-date',
      })
    ).toThrow(TypeError);
  });
});
