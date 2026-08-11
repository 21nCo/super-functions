import { describe, expect, it } from 'vitest';
import { WorkflowEngine } from '../src/core/workflow-engine.js';
import { ProviderRegistry } from '../src/core/provider-registry.js';
import { WebhookHandler } from '../src/webhooks/webhook-handler.js';
import type { WorkflowStorage } from '../src/storage/workflow-storage.js';
import { NoopLogger } from '../src/utils/logger.js';
import {
  WorkflowStatus,
  WorkflowExecutionStatus,
  type Workflow,
  type WorkflowExecution,
} from '../src/types/workflow.js';

describe('workflow idempotency and crash recovery', () => {
  it('resumes failed execution by idempotency key without duplicating completed side effects', async () => {
    const storage = new InMemoryWorkflowStorage();
    const logger = new NoopLogger();
    const providerRegistry = new ProviderRegistry(logger);
    const webhookHandler = new WebhookHandler(providerRegistry, logger);
    const engine = new WorkflowEngine(storage, webhookHandler, logger);

    const sideEffects: string[] = [];
    let failStepTwoOnce = true;
    const workflow = await engine.create({
      userId: 'user-1',
      name: 'workflow-idempotency',
      status: WorkflowStatus.Enabled,
      definition: {
        trigger: {
          provider: 'test',
          event: 'incoming.event',
        },
        steps: [
          {
            id: 'step-1',
            type: 'action',
            action: async () => {
              sideEffects.push('step-1');
              return {
                first: true,
              };
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
              return {
                second: true,
              };
            },
          },
        ],
      },
    });

    await expect(
      engine.execute(workflow.id, {
        idempotencyKey: 'ik-1',
      })
    ).rejects.toThrow('step two failed');

    const failedExecution = (await storage.listExecutions(workflow.id, 10))[0];
    expect(failedExecution.status).toBe(WorkflowExecutionStatus.Failed);
    expect(failedExecution.error).toBe('WORKFLOW_STEP_FAILED:step two failed');
    expect(failedExecution.output.__workflow).toMatchObject({
      idempotencyKey: 'ik-1',
      completedStepIds: ['step-1'],
      retriable: true,
      resumed: false,
      failedStepId: 'step-2',
      errorCode: 'WORKFLOW_STEP_FAILED',
    });
    expect(sideEffects).toEqual(['step-1']);

    const resumedEngine = new WorkflowEngine(
      storage,
      new WebhookHandler(new ProviderRegistry(logger), logger),
      logger
    );
    const resumedExecution = await resumedEngine.execute(workflow.id, {
      idempotencyKey: 'ik-1',
    });

    expect(resumedExecution.status).toBe(WorkflowExecutionStatus.Completed);
    expect(resumedExecution.output.__workflow).toMatchObject({
      idempotencyKey: 'ik-1',
      completedStepIds: ['step-1', 'step-2'],
      retriable: false,
      resumed: true,
    });
    expect(sideEffects).toEqual(['step-1', 'step-2']);
  });

  it('returns prior completed execution for duplicate idempotency key', async () => {
    const storage = new InMemoryWorkflowStorage();
    const logger = new NoopLogger();
    const providerRegistry = new ProviderRegistry(logger);
    const webhookHandler = new WebhookHandler(providerRegistry, logger);
    const engine = new WorkflowEngine(storage, webhookHandler, logger);

    let sideEffectCount = 0;
    const workflow = await engine.create({
      userId: 'user-1',
      name: 'workflow-idempotency-completed',
      status: WorkflowStatus.Enabled,
      definition: {
        trigger: {
          provider: 'test',
          event: 'incoming.event',
        },
        steps: [
          {
            id: 'step-1',
            type: 'action',
            action: async () => {
              sideEffectCount += 1;
              return {
                count: sideEffectCount,
              };
            },
          },
        ],
      },
    });

    const first = await engine.execute(workflow.id, {
      idempotencyKey: 'ik-2',
    });
    const second = await engine.execute(workflow.id, {
      idempotencyKey: 'ik-2',
    });

    expect(first.id).toBe(second.id);
    expect(first.status).toBe(WorkflowExecutionStatus.Completed);
    expect(second.status).toBe(WorkflowExecutionStatus.Completed);
    expect(sideEffectCount).toBe(1);
  });

  it('checkpoints completed nested branch steps before resuming', async () => {
    const storage = new InMemoryWorkflowStorage();
    const logger = new NoopLogger();
    const engine = new WorkflowEngine(
      storage,
      new WebhookHandler(new ProviderRegistry(logger), logger),
      logger
    );
    const sideEffects: string[] = [];
    let failSecondNestedStep = true;
    const workflow = await engine.create({
      userId: 'user-1',
      name: 'workflow-nested-checkpoints',
      status: WorkflowStatus.Enabled,
      definition: {
        trigger: { provider: 'test', event: 'incoming.event' },
        steps: [
          {
            id: 'branch-1',
            type: 'branch',
            condition: () => true,
            then: [
              {
                id: 'nested-1',
                type: 'action',
                action: async () => {
                  sideEffects.push('nested-1');
                  return { nestedOne: true };
                },
              },
              {
                id: 'nested-2',
                type: 'action',
                action: async () => {
                  if (failSecondNestedStep) {
                    failSecondNestedStep = false;
                    throw new Error('nested step failed');
                  }
                  sideEffects.push('nested-2');
                  return { nestedTwo: true };
                },
              },
            ],
          },
        ],
      },
    });

    await expect(
      engine.execute(workflow.id, { idempotencyKey: 'ik-nested' })
    ).rejects.toThrow('nested step failed');

    const failed = await storage.findExecutionByIdempotencyKey(workflow.id, 'ik-nested');
    expect(failed?.output.__workflow.completedStepIds).toEqual(['nested-1']);
    expect(sideEffects).toEqual(['nested-1']);

    const resumedEngine = new WorkflowEngine(
      storage,
      new WebhookHandler(new ProviderRegistry(logger), logger),
      logger
    );
    const resumed = await resumedEngine.execute(workflow.id, { idempotencyKey: 'ik-nested' });

    expect(resumed.status).toBe(WorkflowExecutionStatus.Completed);
    expect(resumed.output.__workflow.completedStepIds).toEqual([
      'nested-1',
      'nested-2',
      'branch-1',
    ]);
    expect(sideEffects).toEqual(['nested-1', 'nested-2']);
  });
});

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
      const key =
        typeof workflowInput?.idempotencyKey === 'string'
          ? workflowInput.idempotencyKey
          : typeof input?.idempotencyKey === 'string'
            ? input.idempotencyKey
            : undefined;
      if (key === idempotencyKey) {
        return execution;
      }
    }

    return null;
  }
}
