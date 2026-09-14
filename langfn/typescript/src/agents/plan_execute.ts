import { LangFn } from "../client.js";
import { AgentMaxIterationsError, InternalError, ValidationError } from "../core/errors.js";

export interface PlanExecuteResult {
  plan: string[];
  stepResults: string[];
  output: string;
}

export interface PlanExecuteAgentOptions {
  lang?: LangFn;
  planner?: (goal: string) => Promise<string[]> | string[];
  executor?: (step: string, context: { goal: string; stepIndex: number; previousResults: string[] }) => Promise<string> | string;
  max_plan_steps?: number;
  max_execution_steps?: number;
}

export class PlanExecuteAgent {
  constructor(private readonly options: PlanExecuteAgentOptions) {}

  async run(goal: string): Promise<PlanExecuteResult> {
    const plan = await this.createPlan(goal);
    if (!plan.length) {
      throw new ValidationError("Planner returned an empty plan");
    }
    const maxPlanSteps = this.options.max_plan_steps ?? 10;
    if (plan.length > maxPlanSteps) {
      throw new AgentMaxIterationsError("Plan exceeds configured limit", {
        metadata: { max_plan_steps: maxPlanSteps, plan_length: plan.length }
      });
    }

    const stepResults: string[] = [];
    const maxExecutionSteps = this.options.max_execution_steps ?? plan.length;
    for (let stepIndex = 0; stepIndex < plan.length; stepIndex += 1) {
      if (stepIndex >= maxExecutionSteps) {
        throw new AgentMaxIterationsError("Execution exceeded configured limit", {
          metadata: { max_execution_steps: maxExecutionSteps }
        });
      }
      stepResults.push(
        await this.executeStep(plan[stepIndex]!, {
          goal,
          stepIndex,
          previousResults: [...stepResults]
        })
      );
    }

    return {
      plan,
      stepResults,
      output: stepResults.join("\n")
    };
  }

  private async createPlan(goal: string): Promise<string[]> {
    if (this.options.planner) {
      return normalizePlan(await this.options.planner(goal));
    }
    if (!this.options.lang) {
      throw new ValidationError("PlanExecuteAgent requires a planner or LangFn instance");
    }
    const response = await this.options.lang.complete(`Create a concise ordered plan for: ${goal}`);
    return normalizePlan(
      response.content
        .split("\n")
        .map((line) => line.replace(/^\s*\d+[.)-]?\s*/, "").trim())
        .filter(Boolean)
    );
  }

  private async executeStep(
    step: string,
    context: { goal: string; stepIndex: number; previousResults: string[] }
  ): Promise<string> {
    try {
      if (this.options.executor) {
        return await this.options.executor(step, context);
      }
      if (!this.options.lang) {
        throw new ValidationError("PlanExecuteAgent requires an executor or LangFn instance");
      }
      const response = await this.options.lang.complete(`Goal: ${context.goal}\nStep ${context.stepIndex + 1}: ${step}`);
      return response.content;
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        throw error;
      }
      throw new InternalError(`Failed to execute plan step: ${step}`, {
        metadata: { step, stepIndex: context.stepIndex },
        cause: error
      });
    }
  }
}

function normalizePlan(plan: string[]): string[] {
  return plan.map((step) => step.trim()).filter(Boolean);
}
