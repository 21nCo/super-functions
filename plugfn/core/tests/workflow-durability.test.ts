import { describe, expect, it } from 'vitest';
import { WorkflowEngine } from '../src/core/workflow-engine.js';
import { ProviderRegistry } from '../src/core/provider-registry.js';
import { WebhookHandler } from '../src/webhooks/webhook-handler.js';
import type { WorkflowStorage } from '../src/storage/workflow-storage.js';
import { NoopLogger } from '../src/utils/logger.js';
import {
  WorkflowExecutionStatus,
  WorkflowStatus,
  type Workflow,
  type WorkflowExecution,
} from '../src/types/workflow.js';

describe('workflow durability semantics', () => {
  it('resumes a failed execution after restart and prevents duplicate completed execution', async () => {
    const { storage, logger } = createHarness();
    const firstEngine = new WorkflowEngine(
      storage,
      new WebhookHandler(new ProviderRegistry(logger), logger),
      logger
    );

    const sideEffects: string[] = [];
    let failStepTwoOnce = true;
    const workflow = await firstEngine.create({
      userId: 'user-1',
      name: 'workflow-durability-resume',
      status: WorkflowStatus.Enabled,
      definition: {
        trigger: {
          provider: 'github',
          event: 'issues.opened',
        },
        steps: [
          {
            id: 'step-1',
            type: 'action',
            action: async () => {
              sideEffects.push('step-1');
              return { first: true };
            },
          },
          {
            id: 'step-2',
            type: 'action',
            action: async () => {
              if (failStepTwoOnce) {
                failStepTwoOnce = false;
                throw new Error('step two failed');
              }
              sideEffects.push('step-2');
              return { second: true };
            },
          },
        ],
      },
    });

    await expect(
      firstEngine.execute(workflow.id, {
        idempotencyKey: 'evt_01',
      })
    ).rejects.toThrow('step two failed');

    const resumedEngine = new WorkflowEngine(
      storage,
      new WebhookHandler(new ProviderRegistry(logger), logger),
      logger
    );
    const resumed = await resumedEngine.execute(workflow.id, {
      idempotencyKey: 'evt_01',
    });
    const duplicate = await resumedEngine.execute(workflow.id, {
      idempotencyKey: 'evt_01',
    });

    expect(resumed.status).toBe(WorkflowExecutionStatus.Completed);
    expect(duplicate.id).toBe(resumed.id);
    expect(duplicate.status).toBe(WorkflowExecutionStatus.Completed);
    expect(resumed.output.__workflow).toMatchObject({
      idempotencyKey: 'evt_01',
      completedStepIds: ['step-1', 'step-2'],
      resumed: true,
      retriable: false,
    });
    expect(sideEffects).toEqual(['step-1', 'step-2']);
  });

  it('fails closed on delay steps with WORKFLOW_DURABILITY_UNSUPPORTED', async () => {
    const { engine, storage } = createHarness();

    const workflow = await engine.create({
      userId: 'user-1',
      name: 'workflow-delay-unsupported',
      status: WorkflowStatus.Enabled,
      definition: {
        trigger: {
          provider: 'github',
          event: 'issues.opened',
        },
        steps: [
          {
            id: 'delay-1',
            type: 'delay',
            duration: 5,
            unit: 'seconds',
          },
        ],
      },
    });

    await expect(
      engine.execute(workflow.id, {
        idempotencyKey: 'evt_delay',
      })
    ).rejects.toMatchObject({
      code: 'WORKFLOW_DURABILITY_UNSUPPORTED',
    });

    const execution = await storage.findExecutionByIdempotencyKey(workflow.id, 'evt_delay');
    expect(execution?.status).toBe(WorkflowExecutionStatus.Failed);
    expect(execution?.error).toBe(
      'WORKFLOW_DURABILITY_UNSUPPORTED:delay step delay-1 requires a durable scheduler'
    );
    expect(execution?.output.__workflow).toMatchObject({
      idempotencyKey: 'evt_delay',
      errorCode: 'WORKFLOW_DURABILITY_UNSUPPORTED',
      retriable: false,
      failedStepId: 'delay-1',
    });
  });

  it('rejects duplicate step IDs across top-level and nested branches', async () => {
    const { engine } = createHarness();

    await expect(
      engine.create({
        userId: 'user-1',
        name: 'workflow-duplicate-step-ids',
        status: WorkflowStatus.Enabled,
        definition: {
          trigger: { provider: 'github', event: 'issues.opened' },
          steps: [
            {
              id: 'duplicate',
              type: 'action',
              action: async () => ({}),
            },
            {
              id: 'branch',
              type: 'branch',
              condition: () => true,
              then: [
                {
                  id: 'duplicate',
                  type: 'action',
                  action: async () => ({}),
                },
              ],
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      code: 'WORKFLOW_DEFINITION_INVALID',
      details: { duplicateStepIds: ['duplicate'] },
    });
  });
});

function createHarness() {
  const storage = new InMemoryWorkflowStorage();
  const logger = new NoopLogger();
  const providerRegistry = new ProviderRegistry(logger);
  const webhookHandler = new WebhookHandler(providerRegistry, logger);
  const engine = new WorkflowEngine(storage, webhookHandler, logger);

  return {
    storage,
    logger,
    webhookHandler,
    engine,
  };
}

class InMemoryWorkflowStorage implements WorkflowStorage {
  private readonly workflows = new Map<string, Workflow>();
  private readonly executions = new Map<string, WorkflowExecution>();
  private workflowCounter = 0;
  private executionCounter = 0;

  async create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const created: Workflow = {
      ...workflow,
      id: `wf_${++this.workflowCounter}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.workflows.set(created.id, created);
    return created;
  }

  async get(id: string): Promise<Workflow | null> {
    return this.workflows.get(id) ?? null;
  }

  async list(userId?: string, status?: WorkflowStatus): Promise<Workflow[]> {
    return [...this.workflows.values()].filter((workflow) => {
      if (userId && workflow.userId !== userId) {
        return false;
      }
      if (status && workflow.status !== status) {
        return false;
      }
      return true;
    });
  }

  async update(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    const current = this.workflows.get(id);
    if (!current) {
      throw new Error(`Workflow ${id} not found`);
    }

    const updated: Workflow = {
      ...current,
      ...updates,
      id: current.id,
      updatedAt: new Date(),
    };
    this.workflows.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.workflows.delete(id);
  }

  async createExecution(
    execution: Omit<WorkflowExecution, 'id' | 'startedAt'>
  ): Promise<WorkflowExecution> {
    const created: WorkflowExecution = {
      ...execution,
      id: `wfx_${++this.executionCounter}`,
      startedAt: new Date(),
    };
    this.executions.set(created.id, created);
    return created;
  }

  async getExecution(id: string): Promise<WorkflowExecution | null> {
    return this.executions.get(id) ?? null;
  }

  async updateExecution(id: string, updates: Partial<WorkflowExecution>): Promise<void> {
    const current = this.executions.get(id);
    if (!current) {
      throw new Error(`Workflow execution ${id} not found`);
    }

    this.executions.set(id, {
      ...current,
      ...updates,
      id: current.id,
      workflowId: current.workflowId,
      startedAt: current.startedAt,
    });
  }

  async listExecutions(workflowId: string, limit = 50): Promise<WorkflowExecution[]> {
    return [...this.executions.values()]
      .filter((execution) => execution.workflowId === workflowId)
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
      .slice(0, limit);
  }

  async findExecutionByIdempotencyKey(
    workflowId: string,
    idempotencyKey: string
  ): Promise<WorkflowExecution | null> {
    const executions = await this.listExecutions(workflowId, 1000);

    for (const execution of executions) {
      const input = execution.input as Record<string, unknown> | undefined;
      const workflowInput = input?.__workflow as Record<string, unknown> | undefined;
      const inputKey =
        typeof workflowInput?.idempotencyKey === 'string'
          ? workflowInput.idempotencyKey
          : typeof input?.idempotencyKey === 'string'
            ? input.idempotencyKey
            : undefined;
      if (inputKey === idempotencyKey) {
        return execution;
      }

      const output = execution.output as Record<string, unknown> | undefined;
      const workflowOutput = output?.__workflow as Record<string, unknown> | undefined;
      if (workflowOutput?.idempotencyKey === idempotencyKey) {
        return execution;
      }
    }

    return null;
  }
}
