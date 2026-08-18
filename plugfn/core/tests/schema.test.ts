import { describe, expect, it } from 'vitest';
import { getSchema, PLUGFN_SCHEMA_VERSION } from '../src/schema.js';

describe('PlugFn schema metadata', () => {
  it('versions and exposes the webhook idempotency uniqueness constraint', () => {
    const schema = getSchema();
    const receipts = schema.schemas.find(
      (table) => table.modelName === 'plugfn_webhook_receipts'
    );

    expect(PLUGFN_SCHEMA_VERSION).toBe(5);
    expect(schema.version).toBe(5);
    expect(receipts?.indexes).toContainEqual({
      name: 'idx_plugfn_webhook_receipts_idempotency',
      fields: ['provider', 'idempotencyKey'],
      unique: true,
    });
  });
});
