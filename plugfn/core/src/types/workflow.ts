/**
 * Workflow status
 */
export enum WorkflowStatus {
  Enabled = 'enabled',
  Disabled = 'disabled',
  Draft = 'draft',
}

/**
 * Workflow execution status
 */
export enum WorkflowExecutionStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/**
 * Workflow definition stored in database
 */
export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  status: WorkflowStatus;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workflow definition structure
 */
export interface WorkflowDefinition {
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  errorHandlers?: WorkflowErrorHandler[];
}

/**
 * Workflow trigger configuration
 */
export interface WorkflowTrigger {
  provider: string;
  event: string;
  filter?: (context: WorkflowContext) => boolean;
}

/**
 * Workflow step types
 */
export type WorkflowStep =
  | ActionStep
  | FilterStep
  | BranchStep
  | ParallelStep
  | DelayStep;

export interface ActionStep {
  type: 'action';
  id: string;
  action: (context: WorkflowContext) => Promise<any>;
}

export interface FilterStep {
  type: 'filter';
  id: string;
  condition: (context: WorkflowContext) => boolean;
}

export interface BranchStep {
  type: 'branch';
  id: string;
  condition: (context: WorkflowContext) => boolean;
  then: WorkflowStep[];
  else?: WorkflowStep[];
}

export interface ParallelStep {
  type: 'parallel';
  id: string;
  actions: Array<(context: WorkflowContext) => Promise<any>>;
}

export interface DelayStep {
  type: 'delay';
  id: string;
  duration: number;
  unit?: 'ms' | 'seconds' | 'minutes' | 'hours' | 'days';
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  userId: string;
  trigger: {
    provider: string;
    event: string;
    payload: any;
  };
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Error handler
 */
export interface WorkflowErrorHandler {
  stepId?: string;
  handler: (error: Error, context: WorkflowContext) => Promise<void>;
}

/**
 * Workflow execution record
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  input?: any;
  output?: any;
  error?: string;
  durationMs?: number;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Workflow statistics
 */
export interface WorkflowStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgDuration: number;
  lastExecutedAt?: Date;
}

/**
 * List workflows options
 */
export interface ListWorkflowsOptions {
  userId?: string;
  status?: WorkflowStatus;
  provider?: string;
}

