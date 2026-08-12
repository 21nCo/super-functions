import type {
  Workflow,
  WorkflowContext,
  WorkflowExecution,
  WorkflowStats,
  ListWorkflowsOptions,
  WorkflowStep,
} from '../types/workflow.js';
import { WorkflowStatus, WorkflowExecutionStatus } from '../types/workflow.js';
import type { Logger } from '../types/action.js';
import { WorkflowStorage } from '../storage/workflow-storage.js';
import { WebhookHandler } from '../webhooks/webhook-handler.js';
import type { TriggerHandler } from '../types/trigger.js';

interface PersistedWorkflowState {
  idempotencyKey?: string;
  completedStepIds: string[];
  retriable: boolean;
  resumed: boolean;
  failedStepId?: string;
  errorCode?: string;
}

interface WorkflowTriggerBinding {
  backend: 'webhook-handler';
  provider: string;
  event: string;
  handler: TriggerHandler;
}

export class WorkflowEngineError extends Error {
  readonly code:
    | 'WORKFLOW_TRIGGER_UNREGISTER_FAILED'
    | 'WORKFLOW_DURABILITY_UNSUPPORTED'
    | 'WORKFLOW_DEFINITION_INVALID';
  readonly status: number;
  readonly retryable = false;
  readonly details: Record<string, unknown>;

  constructor(
    code:
      | 'WORKFLOW_TRIGGER_UNREGISTER_FAILED'
      | 'WORKFLOW_DURABILITY_UNSUPPORTED'
      | 'WORKFLOW_DEFINITION_INVALID',
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'WorkflowEngineError';
    this.code = code;
    this.status = 409;
    this.details = details;
  }
}

export class WorkflowEngine {
  private readonly triggerBindings = new Map<string, WorkflowTriggerBinding>();
  private readonly executionLocks = new Map<string, Promise<void>>();

  constructor(
    private workflowStorage: WorkflowStorage,
    private webhookHandler: WebhookHandler,
    private logger: Logger
  ) {}

  async create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    assertUniqueWorkflowStepIds(workflow.definition.steps);
    const created = await this.workflowStorage.create(workflow);

    if (workflow.status === WorkflowStatus.Enabled) {
      await this.registerTrigger(created);
    }

    this.logger.info(`Workflow created: ${created.name}`, { workflowId: created.id });
    return created;
  }

  async get(id: string): Promise<Workflow | null> {
    return this.workflowStorage.get(id);
  }

  async list(options?: ListWorkflowsOptions): Promise<Workflow[]> {
    return this.workflowStorage.list(options?.userId, options?.status);
  }

  async rehydrateEnabledTriggers(): Promise<{ registered: number; failed: number }> {
    const workflows = await this.workflowStorage.list(undefined, WorkflowStatus.Enabled);
    let registered = 0;
    let failed = 0;

    for (const workflow of workflows) {
      try {
        await this.registerTrigger(workflow);
        registered += 1;
      } catch (error) {
        failed += 1;
        this.logger.error('Workflow trigger rehydration failed', {
          workflowId: workflow.id,
          error,
        });
      }
    }

    return { registered, failed };
  }

  async enable(id: string): Promise<void> {
    const workflow = await this.workflowStorage.get(id);
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }
    assertUniqueWorkflowStepIds(workflow.definition.steps);

    const updated = await this.workflowStorage.update(id, { status: WorkflowStatus.Enabled });
    await this.registerTrigger(updated);

    this.logger.info(`Workflow enabled: ${workflow.name}`, { workflowId: id });
  }

  async disable(id: string): Promise<void> {
    const workflow = await this.workflowStorage.get(id);
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }

    const updated = await this.workflowStorage.update(id, { status: WorkflowStatus.Disabled });
    await this.unregisterTrigger(updated);

    this.logger.info(`Workflow disabled: ${workflow.name}`, { workflowId: id });
  }

  async delete(id: string): Promise<void> {
    const workflow = await this.workflowStorage.get(id);
    if (workflow && (workflow.status === WorkflowStatus.Enabled || this.triggerBindings.has(workflow.id))) {
      await this.unregisterTrigger(workflow);
    }

    await this.workflowStorage.delete(id);
    this.logger.info(`Workflow deleted`, { workflowId: id });
  }

  async execute(workflowId: string, triggerPayload: any): Promise<WorkflowExecution> {
    const workflow = await this.workflowStorage.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== WorkflowStatus.Enabled) {
      throw new Error(`Workflow ${workflowId} is not enabled`);
    }
    assertUniqueWorkflowStepIds(workflow.definition.steps);

    const idempotencyKey = this.resolveIdempotencyKey(triggerPayload);
    const lockKey = idempotencyKey ? `${workflowId}:${idempotencyKey}` : undefined;
    const previousExecution = lockKey
      ? this.executionLocks.get(lockKey) ?? Promise.resolve()
      : Promise.resolve();
    let releaseExecutionLock: (() => void) | undefined;
    let queueTail: Promise<void> | undefined;
    if (lockKey) {
      const current = new Promise<void>((resolve) => {
        releaseExecutionLock = resolve;
      });
      queueTail = previousExecution.catch(() => {}).then(() => current);
      this.executionLocks.set(lockKey, queueTail);
    }

    await previousExecution.catch(() => {});

    try {
      const existingExecution = idempotencyKey
        ? await this.workflowStorage.findExecutionByIdempotencyKey(workflowId, idempotencyKey)
        : null;

      if (existingExecution && existingExecution.status === WorkflowExecutionStatus.Completed) {
        return existingExecution;
      }

      const resumed = Boolean(existingExecution);
      const execution =
        existingExecution ??
        (await this.workflowStorage.createExecution({
          workflowId,
          status: WorkflowExecutionStatus.Running,
          input: this.buildExecutionInput(triggerPayload, idempotencyKey),
        }));

      if (existingExecution) {
        await this.workflowStorage.updateExecution(existingExecution.id, {
          status: WorkflowExecutionStatus.Running,
          error: undefined,
        });
      }

      const executionState = this.readExecutionState(existingExecution ?? null);
      const completedStepIds = [...executionState.completedStepIds];
      const contextData = { ...executionState.data };

      const context: WorkflowContext = {
        workflowId,
        executionId: execution.id,
        userId: workflow.userId,
        trigger: {
          provider: workflow.definition.trigger.provider,
          event: workflow.definition.trigger.event,
          payload: triggerPayload,
        },
        data: contextData,
      };
      const checkpointStep = async (stepId: string): Promise<void> => {
        if (!completedStepIds.includes(stepId)) {
          completedStepIds.push(stepId);
        }
        await this.workflowStorage.updateExecution(execution.id, {
          status: WorkflowExecutionStatus.Running,
          output: this.buildExecutionOutput(context.data, {
            idempotencyKey,
            completedStepIds,
            retriable: false,
            resumed,
          }),
        });
      };

      const startedAtMs = execution.startedAt ? execution.startedAt.getTime() : Date.now();
      let activeStepId: string | undefined;

      try {
        if (workflow.definition.trigger.filter) {
          const shouldRun = workflow.definition.trigger.filter(context);
          if (!shouldRun) {
            await this.workflowStorage.updateExecution(execution.id, {
              status: WorkflowExecutionStatus.Completed,
              output: this.buildExecutionOutput(context.data, {
                idempotencyKey,
                completedStepIds,
                retriable: false,
                resumed,
              }),
              completedAt: new Date(),
              durationMs: Date.now() - startedAtMs,
            });

            const skippedExecution = await this.getExecutionById(workflowId, execution.id);
            return skippedExecution ?? execution;
          }
        }

        for (const step of workflow.definition.steps) {
          activeStepId = step.id;
          if (completedStepIds.includes(step.id)) {
            continue;
          }

          await this.executeStep(step, context, completedStepIds, checkpointStep);
          await checkpointStep(step.id);
        }

        await this.workflowStorage.updateExecution(execution.id, {
          status: WorkflowExecutionStatus.Completed,
          output: this.buildExecutionOutput(context.data, {
            idempotencyKey,
            completedStepIds,
            retriable: false,
            resumed,
          }),
          completedAt: new Date(),
          durationMs: Date.now() - startedAtMs,
        });

        this.logger.info(`Workflow executed successfully: ${workflow.name}`, {
          workflowId,
          executionId: execution.id,
          duration: Date.now() - startedAtMs,
          resumed,
        });

        const completedExecution = await this.getExecutionById(workflowId, execution.id);
        return completedExecution ?? execution;
      } catch (error) {
        const failure = normalizeWorkflowExecutionFailure(error);
        this.logger.error(`Workflow execution failed: ${workflow.name}`, {
          workflowId,
          executionId: execution.id,
          error: failure.error,
        });

        if (workflow.definition.errorHandlers) {
          for (const errorHandler of workflow.definition.errorHandlers) {
            try {
              await errorHandler.handler(failure.error, context);
            } catch (handlerError) {
              this.logger.error('Error handler failed', { handlerError });
            }
          }
        }

        await this.workflowStorage.updateExecution(execution.id, {
          status: WorkflowExecutionStatus.Failed,
          error: `${failure.code}:${failure.error.message}`,
          output: this.buildExecutionOutput(context.data, {
            idempotencyKey,
            completedStepIds,
            retriable: failure.retriable,
            resumed,
            failedStepId: activeStepId,
            errorCode: failure.code,
          }),
          completedAt: new Date(),
          durationMs: Date.now() - startedAtMs,
        });

        throw failure.error;
      }
    } finally {
      if (lockKey && releaseExecutionLock) {
        releaseExecutionLock();
        if (this.executionLocks.get(lockKey) === queueTail) {
          this.executionLocks.delete(lockKey);
        }
      }
    }
  }

  private async executeStep(
    step: WorkflowStep,
    context: WorkflowContext,
    completedStepIds: string[],
    checkpointStep: (stepId: string) => Promise<void>
  ): Promise<void> {
    switch (step.type) {
      case 'action': {
        const result = await step.action(context);
        Object.assign(context.data, result);
        break;
      }

      case 'filter': {
        const shouldContinue = step.condition(context);
        if (!shouldContinue) {
          throw new Error('Filter condition not met');
        }
        break;
      }

      case 'branch': {
        const condition = step.condition(context);
        const branch = condition ? step.then : step.else;
        if (branch) {
          for (const branchStep of branch) {
            if (completedStepIds.includes(branchStep.id)) {
              continue;
            }
            await this.executeStep(branchStep, context, completedStepIds, checkpointStep);
            await checkpointStep(branchStep.id);
          }
        }
        break;
      }

      case 'parallel': {
        const pendingActions = step.actions
          .map((action, index) => ({
            action,
            checkpointId: parallelActionCheckpointId(step.id, index),
          }))
          .filter(({ checkpointId }) => !completedStepIds.includes(checkpointId));
        const results = await Promise.allSettled(
          pendingActions.map(({ action }) => action(context))
        );

        for (const [index, result] of results.entries()) {
          if (result.status === 'fulfilled') {
            await checkpointStep(pendingActions[index].checkpointId);
          }
        }

        const failure = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        if (failure) {
          throw failure.reason;
        }
        break;
      }

      case 'delay': {
        const ms = this.convertDelayToMs(step);
        throw new WorkflowEngineError(
          'WORKFLOW_DURABILITY_UNSUPPORTED',
          `delay step ${step.id} requires a durable scheduler`,
          {
            stepId: step.id,
            durationMs: ms,
          }
        );
      }

      default: {
        const unsupportedType = (step as { type?: unknown }).type;
        throw new Error(`Unknown workflow step type: ${String(unsupportedType)}`);
      }
    }
  }

  private convertDelayToMs(step: any): number {
    const { duration, unit = 'ms' } = step;

    switch (unit) {
      case 'ms':
        return duration;
      case 'seconds':
        return duration * 1000;
      case 'minutes':
        return duration * 60 * 1000;
      case 'hours':
        return duration * 60 * 60 * 1000;
      case 'days':
        return duration * 24 * 60 * 60 * 1000;
      default:
        return duration;
    }
  }

  async getStats(workflowId: string): Promise<WorkflowStats> {
    const executions = await this.workflowStorage.listExecutions(workflowId, 1000);

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(
      (execution) => execution.status === WorkflowExecutionStatus.Completed
    ).length;
    const failedExecutions = executions.filter(
      (execution) => execution.status === WorkflowExecutionStatus.Failed
    ).length;

    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    const durations = executions
      .filter((execution) => execution.durationMs)
      .map((execution) => execution.durationMs as number);
    const avgDuration = durations.length > 0
      ? durations.reduce((left, right) => left + right, 0) / durations.length
      : 0;

    const lastExecutedAt = executions.length > 0 ? executions[0].startedAt : undefined;

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
      avgDuration,
      lastExecutedAt,
    };
  }

  private async registerTrigger(workflow: Workflow): Promise<void> {
    assertUniqueWorkflowStepIds(workflow.definition.steps);
    if (this.triggerBindings.has(workflow.id)) {
      await this.unregisterTrigger(workflow, { allowMissing: true });
    }

    const handler: TriggerHandler = async (event: any) => {
      try {
        await this.execute(workflow.id, event);
      } catch (error) {
        this.logger.error(`Workflow trigger execution failed`, { workflow: workflow.id, error });
      }
    };

    this.webhookHandler.on(
      workflow.definition.trigger.provider,
      workflow.definition.trigger.event,
      handler
    );

    this.triggerBindings.set(workflow.id, {
      backend: 'webhook-handler',
      provider: workflow.definition.trigger.provider,
      event: workflow.definition.trigger.event,
      handler,
    });

    this.logger.info('Workflow trigger registered', {
      workflowId: workflow.id,
      backend: 'webhook-handler',
      provider: workflow.definition.trigger.provider,
      event: workflow.definition.trigger.event,
    });
  }

  private async unregisterTrigger(
    workflow: Workflow,
    options: { allowMissing?: boolean } = {}
  ): Promise<void> {
    const binding = this.triggerBindings.get(workflow.id);

    if (!binding) {
      this.logger.error('Workflow trigger unregister failed: missing active binding', {
        workflowId: workflow.id,
        provider: workflow.definition.trigger.provider,
        event: workflow.definition.trigger.event,
      });

      if (options.allowMissing) {
        return;
      }

      throw new WorkflowEngineError(
        'WORKFLOW_TRIGGER_UNREGISTER_FAILED',
        `active trigger binding not found for workflow ${workflow.id}`,
        {
          workflowId: workflow.id,
          provider: workflow.definition.trigger.provider,
          event: workflow.definition.trigger.event,
          backend: 'webhook-handler',
        }
      );
    }

    this.webhookHandler.off(binding.provider, binding.event, binding.handler);
    this.triggerBindings.delete(workflow.id);

    this.logger.info('Workflow trigger unregistered', {
      workflowId: workflow.id,
      backend: binding.backend,
      provider: binding.provider,
      event: binding.event,
    });
  }

  private buildExecutionInput(triggerPayload: any, idempotencyKey?: string): any {
    return {
      ...triggerPayload,
      __workflow: {
        idempotencyKey,
      },
    };
  }

  private buildExecutionOutput(data: Record<string, any>, state: PersistedWorkflowState): any {
    return {
      data,
      __workflow: {
        idempotencyKey: state.idempotencyKey,
        completedStepIds: [...state.completedStepIds],
        retriable: state.retriable,
        resumed: state.resumed,
        failedStepId: state.failedStepId,
        errorCode: state.errorCode,
      },
    };
  }

  private readExecutionState(execution: WorkflowExecution | null): {
    data: Record<string, any>;
    completedStepIds: string[];
  } {
    if (!execution || !execution.output || typeof execution.output !== 'object') {
      return {
        data: {},
        completedStepIds: [],
      };
    }

    const output = execution.output as Record<string, any>;
    const workflowState = output.__workflow as Record<string, any> | undefined;
    const completedStepIds = Array.isArray(workflowState?.completedStepIds)
      ? workflowState?.completedStepIds.filter((value: unknown): value is string => {
          return typeof value === 'string' && value.length > 0;
        })
      : [];

    const data = output.data && typeof output.data === 'object'
      ? (output.data as Record<string, any>)
      : {};

    return {
      data,
      completedStepIds,
    };
  }

  private resolveIdempotencyKey(triggerPayload: any): string | undefined {
    if (!triggerPayload || typeof triggerPayload !== 'object') {
      return undefined;
    }

    const explicit = triggerPayload.idempotencyKey;
    if (typeof explicit === 'string' && explicit.length > 0) {
      return explicit;
    }

    const payloadId = triggerPayload.id;
    if (typeof payloadId === 'string' && payloadId.length > 0) {
      return payloadId;
    }

    return undefined;
  }

  private async getExecutionById(
    workflowId: string,
    executionId: string
  ): Promise<WorkflowExecution | null> {
    const execution = await this.workflowStorage.getExecution(executionId);
    if (!execution || execution.workflowId !== workflowId) {
      return null;
    }

    return execution;
  }
}

function parallelActionCheckpointId(stepId: string, actionIndex: number): string {
  return `__parallel__:${stepId}:${actionIndex}`;
}

function assertUniqueWorkflowStepIds(steps: WorkflowStep[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  const visit = (step: WorkflowStep): void => {
    if (seen.has(step.id)) {
      duplicates.add(step.id);
    } else {
      seen.add(step.id);
    }

    if (step.type === 'branch') {
      for (const nested of [...step.then, ...(step.else ?? [])]) {
        visit(nested);
      }
    }
  };

  for (const step of steps) {
    visit(step);
  }

  if (duplicates.size > 0) {
    const duplicateStepIds = [...duplicates].sort((left, right) => left.localeCompare(right));
    throw new WorkflowEngineError(
      'WORKFLOW_DEFINITION_INVALID',
      `workflow step IDs must be unique: ${duplicateStepIds.join(', ')}`,
      { duplicateStepIds }
    );
  }
}

function normalizeWorkflowExecutionFailure(error: unknown): {
  code: string;
  retriable: boolean;
  error: Error;
} {
  if (error instanceof WorkflowEngineError) {
    return {
      code: error.code,
      retriable: false,
      error,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'WORKFLOW_STEP_FAILED',
      retriable: true,
      error,
    };
  }

  return {
    code: 'WORKFLOW_STEP_FAILED',
    retriable: true,
    error: new Error('workflow execution failed'),
  };
}
