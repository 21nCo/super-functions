import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@superfunctions/db';
import { createPlugFnDatabaseAdapter } from '../src/storage/adapters/database.js';
import { WorkflowStatus, type Workflow } from '../src/types/workflow.js';

describe('database workflow storage', () => {
  it('uses a deterministic total order when paging sync jobs', async () => {
    const findMany = vi.fn(async () => []);
    const adapter = createPlugFnDatabaseAdapter({
      database: { id: 'postgres', findMany } as any,
    });

    await adapter.listSyncJobs({ ownerId: 'user_1' }, 25, 10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [
        { field: 'createdAt', direction: 'desc' },
        { field: 'id', direction: 'desc' },
      ],
      limit: 25,
      offset: 10,
    }));
  });

  it('preserves executable workflow callbacks while copying records', async () => {
    const create = vi.fn(async ({ data }: { data: Workflow }) => data);
    const adapter = createPlugFnDatabaseAdapter({
      database: { id: 'memory', create } as any,
    });
    const action = async () => ({ ok: true });
    const workflow: Workflow = {
      id: 'workflow_1',
      userId: 'user_1',
      name: 'Executable workflow',
      status: WorkflowStatus.Draft,
      definition: {
        trigger: { provider: 'github', event: 'issues.opened' },
        steps: [{ id: 'step_1', type: 'action', action }],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = await adapter.createWorkflow(workflow);

    expect(created).not.toBe(workflow);
    expect(created.definition.steps[0]).not.toBe(workflow.definition.steps[0]);
    expect((created.definition.steps[0] as { action: unknown }).action).toBe(action);
  });

  it('rejects callback workflows before writing them to a persistent adapter', async () => {
    const create = vi.fn();
    const adapter = createPlugFnDatabaseAdapter({
      database: { id: 'postgres', create } as any,
    });
    const workflow = createWorkflow();

    await expect(adapter.createWorkflow(workflow)).rejects.toThrow(
      'cannot serialize callback at workflow.definition.steps[0].action'
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('copies cyclic workflow metadata without recursing forever in memory', async () => {
    const create = vi.fn(async ({ data }: { data: Workflow }) => data);
    const adapter = createPlugFnDatabaseAdapter({
      database: { id: 'memory', create } as any,
    });
    const workflow = createWorkflow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    workflow.metadata = cyclic;

    const created = await adapter.createWorkflow(workflow);

    expect(created.metadata).not.toBe(cyclic);
    expect(created.metadata?.self).toBe(created.metadata);
  });

  it.each([
    ['Map', new Map([['key', 'value']])],
    ['Set', new Set(['value'])],
  ])('rejects %s workflow metadata before persistent JSON storage', async (type, metadata) => {
    const create = vi.fn();
    const adapter = createPlugFnDatabaseAdapter({
      database: { id: 'postgres', create } as any,
    });
    const workflow = createWorkflow();
    workflow.definition.steps = [
      { id: 'step_1', type: 'action', action: 'github.issues.get' },
    ];
    workflow.metadata = { value: metadata };

    await expect(adapter.createWorkflow(workflow)).rejects.toThrow(
      `cannot serialize ${type} at workflow.metadata.value`
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('returns null only when a claimed webhook delivery no longer exists', async () => {
    const update = vi.fn(async () => {
      throw new NotFoundError('plugfn_webhook_deliveries', []);
    });
    const adapter = createPlugFnDatabaseAdapter({
      database: { id: 'postgres', update } as any,
    });

    await expect(
      adapter.updateClaimedWebhookDelivery('delivery_1', 'claim_1', { status: 'success' })
    ).resolves.toBeNull();
  });

  it('propagates database outages while updating a claimed webhook delivery', async () => {
    const update = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const adapter = createPlugFnDatabaseAdapter({
      database: { id: 'postgres', update } as any,
    });

    await expect(
      adapter.updateClaimedWebhookDelivery('delivery_1', 'claim_1', { status: 'success' })
    ).rejects.toThrow('database unavailable');
  });
});

function createWorkflow(): Workflow {
  return {
    id: 'workflow_1',
    userId: 'user_1',
    name: 'Executable workflow',
    status: WorkflowStatus.Draft,
    definition: {
      trigger: { provider: 'github', event: 'issues.opened' },
      steps: [{ id: 'step_1', type: 'action', action: async () => ({ ok: true }) }],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
