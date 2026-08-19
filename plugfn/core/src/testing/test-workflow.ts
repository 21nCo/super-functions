import type { Workflow, WorkflowContext, WorkflowRuntimeRegistry } from '../types/workflow.js';
import type { Provider } from '../types/provider.js';

/**
 * Workflow test options
 */
export interface WorkflowTestOptions {
  trigger: {
    provider: string;
    event: string;
    payload: any;
  };
  mocks?: Record<string, Provider>;
  timeout?: number;
  runtime?: WorkflowRuntimeRegistry;
}

/**
 * Workflow test result
 */
export interface WorkflowTestResult {
  success: boolean;
  duration: number;
  output?: any;
  error?: Error;
  steps: Array<{
    id: string;
    success: boolean;
    duration: number;
    output?: any;
    error?: Error;
  }>;
}

/**
 * Test a workflow
 */
export async function testWorkflow(
  workflow: Workflow,
  options: WorkflowTestOptions
): Promise<WorkflowTestResult> {
  const startTime = Date.now();
  const steps: WorkflowTestResult['steps'] = [];

  try {
    // Build test context
    const context: WorkflowContext = {
      workflowId: workflow.id,
      executionId: `test-exec-${Date.now()}`,
      userId: workflow.userId,
      trigger: options.trigger,
      data: {},
    };

    // Check filter
    if (workflow.definition.trigger.filter) {
      const filter = workflow.definition.trigger.filter;
      const condition = typeof filter === 'function'
        ? filter
        : options.runtime?.conditions?.[filter];
      if (!condition) {
        throw new Error(`Workflow condition reference ${String(filter)} is not registered`);
      }
      const shouldRun = condition(context);
      if (!shouldRun) {
        return {
          success: true,
          duration: Date.now() - startTime,
          output: { skipped: true },
          steps: [],
        };
      }
    }

    // Execute steps
    for (const step of workflow.definition.steps) {
      const stepStartTime = Date.now();
      
      try {
        await executeTestStep(step, context, options.runtime);
        
        steps.push({
          id: step.id,
          success: true,
          duration: Date.now() - stepStartTime,
          output: context.data,
        });
      } catch (error) {
        steps.push({
          id: step.id,
          success: false,
          duration: Date.now() - stepStartTime,
          error: error as Error,
        });
        throw error;
      }
    }

    return {
      success: true,
      duration: Date.now() - startTime,
      output: context.data,
      steps,
    };
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error as Error,
      steps,
    };
  }
}

/**
 * Execute a workflow step in test mode
 */
async function executeTestStep(
  step: any,
  context: WorkflowContext,
  runtime?: WorkflowRuntimeRegistry
): Promise<void> {
  switch (step.type) {
    case 'action': {
      const action = typeof step.action === 'function' ? step.action : runtime?.actions?.[step.action];
      if (!action) throw new Error(`Workflow action reference ${String(step.action)} is not registered`);
      const result = await action(context);
      Object.assign(context.data, result);
      break;
    }

    case 'filter': {
      const condition = typeof step.condition === 'function'
        ? step.condition
        : runtime?.conditions?.[step.condition];
      if (!condition) throw new Error(`Workflow condition reference ${String(step.condition)} is not registered`);
      const shouldContinue = condition(context);
      if (!shouldContinue) {
        throw new Error('Filter condition not met');
      }
      break;
    }

    case 'branch': {
      const condition = typeof step.condition === 'function'
        ? step.condition
        : runtime?.conditions?.[step.condition];
      if (!condition) throw new Error(`Workflow condition reference ${String(step.condition)} is not registered`);
      const branch = condition(context) ? step.then : step.else;
      if (branch) {
        for (const branchStep of branch) {
          await executeTestStep(branchStep, context, runtime);
        }
      }
      break;
    }

    case 'parallel': {
      const actions = step.actions.map((action: any) => {
        const resolved = typeof action === 'function' ? action : runtime?.actions?.[action];
        if (!resolved) throw new Error(`Workflow action reference ${String(action)} is not registered`);
        return resolved;
      });
      await Promise.all(actions.map((action: any) => action(context)));
      break;
    }

    case 'delay':
      // In test mode, skip actual delays
      break;
  }
}

/**
 * Assert workflow result
 */
export function assertWorkflowSuccess(result: WorkflowTestResult): void {
  if (!result.success) {
    throw new Error(
      `Workflow test failed: ${result.error?.message || 'Unknown error'}`
    );
  }
}

/**
 * Assert workflow error
 */
export function assertWorkflowError(result: WorkflowTestResult, expectedMessage?: string): void {
  if (result.success) {
    throw new Error('Expected workflow to fail, but it succeeded');
  }

  if (expectedMessage && result.error?.message !== expectedMessage) {
    throw new Error(
      `Expected error message "${expectedMessage}", got "${result.error?.message}"`
    );
  }
}
