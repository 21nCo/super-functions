import { describe, expect, it } from 'vitest';
import { getSchema, PLUGFN_SCHEMA_VERSION } from '../src/schema.js';

describe('PlugFn schema metadata', () => {
  it('versions and exposes the webhook idempotency uniqueness constraint', () => {
    const schema = getSchema();
    const receipts = schema.schemas.find(
      (table) => table.modelName === 'plugfn_webhook_receipts'
    );

    expect(PLUGFN_SCHEMA_VERSION).toBe(7);
    expect(schema.version).toBe(7);
    expect(receipts?.indexes).toContainEqual({
      name: 'idx_plugfn_webhook_receipts_idempotency',
      fields: ['provider', 'idempotencyKey'],
      unique: true,
    });

    const connections = schema.schemas.find(
      (table) => table.modelName === 'plugfn_connections'
    );
    const syncJobs = schema.schemas.find(
      (table) => table.modelName === 'plugfn_sync_jobs'
    );
    expect(connections).toBeDefined();
    expect(connections!.fields.claimToken).toBeUndefined();
    expect(syncJobs).toBeDefined();
    expect(syncJobs!.fields.claimToken).toMatchObject({
      fieldName: 'claim_token',
      maxLength: 64,
    });
    expect(syncJobs!.indexes).toContainEqual({
      name: 'idx_plugfn_sync_jobs_claim_token',
      fields: ['claimToken'],
      unique: true,
    });
    const workflows = schema.schemas.find(
      (table) => table.modelName === 'plugfn_workflows'
    );
    expect(workflows?.fields.tenantId).toMatchObject({
      fieldName: 'tenant_id',
      required: false,
    });
    expect(workflows?.indexes).toContainEqual({
      name: 'idx_plugfn_workflows_tenant_user',
      fields: ['tenantId', 'userId'],
    });
  });
});
