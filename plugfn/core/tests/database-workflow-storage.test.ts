import { describe, expect, it, vi } from 'vitest';
import { createPlugFnDatabaseAdapter } from '../src/storage/adapters/database.js';
import { WorkflowStatus, type Workflow } from '../src/types/workflow.js';

describe('database workflow storage', () => {
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
