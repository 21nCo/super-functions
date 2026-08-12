import { describe, expect, it } from 'vitest';
import { WorkflowEngine, WorkflowEngineError } from '../src/core/workflow-engine.js';
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

describe('workflow lifecycle trigger handling', () => {
  it('enabling and disabling a workflow registers then detaches the live trigger binding', async () => {
    const { engine, storage, webhookHandler } = createHarness();

    const workflow = await engine.create(createWorkflowDefinition(WorkflowStatus.Draft));
    expect(webhookHandler.getHandlerCount('github', 'issues.opened')).toBe(0);

    await engine.enable(workflow.id);
    expect(webhookHandler.getHandlerCount('github', 'issues.opened')).toBe(1);

    await engine.disable(workflow.id);
    expect(webhookHandler.getHandlerCount('github', 'issues.opened')).toBe(0);
    expect((await storage.get(workflow.id))?.status).toBe(WorkflowStatus.Disabled);
  });

  it('deleting an enabled workflow unregisters the live trigger binding before record deletion', async () => {
    const { engine, storage, webhookHandler } = createHarness();

    const workflow = await engine.create(createWorkflowDefinition(WorkflowStatus.Enabled));
    expect(webhookHandler.getHandlerCount('github', 'issues.opened')).toBe(1);

    await engine.delete(workflow.id);

    expect(webhookHandler.getHandlerCount('github', 'issues.opened')).toBe(0);
    expect(await storage.get(workflow.id)).toBeNull();
  });

  it('fails closed when unregister would otherwise be a silent no-op', async () => {
    const { engine, storage } = createHarness();

    const workflow = await engine.create(createWorkflowDefinition(WorkflowStatus.Draft));
    await storage.update(workflow.id, { status: WorkflowStatus.Enabled });

    await expect(engine.disable(workflow.id)).rejects.toMatchObject({
      code: 'WORKFLOW_TRIGGER_UNREGISTER_FAILED',
    } satisfies Partial<WorkflowEngineError>);
  });

  it('rejects invalid persisted definitions before enablement or rehydration', async () => {
    const { engine, storage, webhookHandler } = createHarness();
    const workflow = await engine.create(createWorkflowDefinition(WorkflowStatus.Draft));
    const invalidDefinition = {
      ...workflow.definition,
      steps: [
        ...workflow.definition.steps,
        {
          id: 'step-1',
          type: 'action' as const,
          action: async () => ({ duplicate: true }),
        },
      ],
    };
    await storage.update(workflow.id, { definition: invalidDefinition });

    await expect(engine.enable(workflow.id)).rejects.toMatchObject({
      code: 'WORKFLOW_DEFINITION_INVALID',
    });
    expect((await storage.get(workflow.id))?.status).toBe(WorkflowStatus.Draft);

    await storage.update(workflow.id, { status: WorkflowStatus.Enabled });
    const rehydrated = new WorkflowEngine(storage, webhookHandler, new NoopLogger());
    await expect(rehydrated.rehydrateEnabledTriggers()).resolves.toEqual({
      registered: 0,
      failed: 1,
    });
    expect(webhookHandler.getHandlerCount('github', 'issues.opened')).toBe(0);
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
    webhookHandler,
    engine,
  };
}

function createWorkflowDefinition(status: WorkflowStatus) {
  return {
    userId: 'user-1',
    name: `workflow-${status}`,
    status,
    definition: {
      trigger: {
        provider: 'github',
        event: 'issues.opened',
      },
      steps: [
        {
          id: 'step-1',
          type: 'action' as const,
          action: async () => ({ ok: true }),
        },
      ],
    },
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
