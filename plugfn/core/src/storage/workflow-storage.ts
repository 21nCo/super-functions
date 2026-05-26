import type { Workflow, WorkflowExecution, WorkflowStatus } from '../types/workflow.js';
import type { Adapter as DbAdapter } from '@superfunctions/db';
import {
  ensurePlugFnDatabaseAdapter,
  type PlugFnDatabaseStorageAdapter,
} from './adapters/database.js';

/**
 * Workflow storage interface
 */
export interface WorkflowStorage {
  create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow>;
  get(id: string): Promise<Workflow | null>;
  list(userId?: string, status?: WorkflowStatus): Promise<Workflow[]>;
  update(id: string, updates: Partial<Workflow>): Promise<Workflow>;
  delete(id: string): Promise<void>;
  
  // Executions
  createExecution(execution: Omit<WorkflowExecution, 'id' | 'startedAt'>): Promise<WorkflowExecution>;
  getExecution(id: string): Promise<WorkflowExecution | null>;
  updateExecution(id: string, updates: Partial<WorkflowExecution>): Promise<void>;
  listExecutions(workflowId: string, limit?: number): Promise<WorkflowExecution[]>;
  findExecutionByIdempotencyKey(
    workflowId: string,
    idempotencyKey: string
  ): Promise<WorkflowExecution | null>;
}

/**
 * Workflow storage implementation using adapter
 */
export class AdapterWorkflowStorage implements WorkflowStorage {
  private readonly adapter: PlugFnDatabaseStorageAdapter;

  constructor(adapter: DbAdapter | PlugFnDatabaseStorageAdapter) {
    this.adapter = ensurePlugFnDatabaseAdapter(adapter);
  }

  async create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const id = this.generateId();
    const now = new Date();
    
    const fullWorkflow: Workflow = {
      ...workflow,
      id,
      createdAt: now,
      updatedAt: now,
    };
    
    return this.adapter.createWorkflow(fullWorkflow);
  }

  async get(id: string): Promise<Workflow | null> {
    return this.adapter.getWorkflow(id);
  }

  async list(userId?: string, status?: WorkflowStatus): Promise<Workflow[]> {
    return this.adapter.listWorkflows(userId, status);
  }

  async update(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    await this.adapter.updateWorkflow(id, {
      ...updates,
      updatedAt: new Date(),
    });
    
    const updated = await this.adapter.getWorkflow(id);
    if (!updated) {
      throw new Error(`Workflow ${id} not found after update`);
    }
    
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.adapter.deleteWorkflow(id);
  }

  async createExecution(execution: Omit<WorkflowExecution, 'id' | 'startedAt'>): Promise<WorkflowExecution> {
    const id = this.generateExecutionId();
    const startedAt = new Date();
    
    const fullExecution: WorkflowExecution = {
      ...execution,
      id,
      startedAt,
    };
    
    return this.adapter.createWorkflowExecution(fullExecution);
  }

  async getExecution(id: string): Promise<WorkflowExecution | null> {
    const executions = await this.adapter.database.findMany<WorkflowExecution>({
      model: this.adapter.models.workflowExecutions,
      where: [{ field: 'id', operator: 'eq', value: id }],
      limit: 1,
    });

    return executions[0] ?? null;
  }

  async updateExecution(id: string, updates: Partial<WorkflowExecution>): Promise<void> {
    await this.adapter.updateWorkflowExecution(id, updates);
  }

  async listExecutions(workflowId: string, limit?: number): Promise<WorkflowExecution[]> {
    return this.adapter.listWorkflowExecutions(workflowId, limit);
  }

  async findExecutionByIdempotencyKey(
    workflowId: string,
    idempotencyKey: string
  ): Promise<WorkflowExecution | null> {
    const executions = await this.adapter.listWorkflowExecutions(workflowId, 1000);

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
      const outputKey =
        typeof workflowOutput?.idempotencyKey === 'string'
          ? workflowOutput.idempotencyKey
          : undefined;
      if (outputKey === idempotencyKey) {
        return execution;
      }
    }

    return null;
  }

  private generateId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateExecutionId(): string {
    return `wfx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
