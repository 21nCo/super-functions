import { AgentMaxIterationsError, InternalError, ValidationError } from "../core/errors.js";

export interface CoordinatedAgent {
  run(task: string): Promise<string | { output: string }> | string | { output: string };
}

export interface MultiAgentResult {
  decisions: string[];
  outputs: string[];
  output: string;
}

export interface MultiAgentCoordinatorOptions {
  agents: Record<string, CoordinatedAgent>;
  coordinator: (task: string, context: { decisions: string[]; outputs: string[] }) => Promise<string> | string;
  max_iterations?: number;
}

export class MultiAgentCoordinator {
  constructor(private readonly options: MultiAgentCoordinatorOptions) {}

  async run(task: string): Promise<MultiAgentResult> {
    const decisions: string[] = [];
    const outputs: string[] = [];
    let currentTask = task;
    const maxIterations = this.options.max_iterations ?? 5;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let decision: string;
      try {
        decision = await this.options.coordinator(currentTask, {
          decisions: [...decisions],
          outputs: [...outputs]
        });
      } catch (error) {
        throw new InternalError("Coordinator failed to select an agent", { cause: error });
      }

      if (decision === "__end__") {
        return {
          decisions,
          outputs,
          output: outputs[outputs.length - 1] ?? ""
        };
      }

      const agent = Object.hasOwn(this.options.agents, decision)
        ? this.options.agents[decision]
        : undefined;
      if (!agent) {
        throw new ValidationError(`Unknown agent: ${decision}`, { metadata: { agent: decision } });
      }

      decisions.push(decision);
      outputs.push(await normalizeAgentOutput(agent.run(currentTask)));
      currentTask = outputs[outputs.length - 1] ?? currentTask;
    }

    throw new AgentMaxIterationsError("Coordinator exceeded max iterations", {
      metadata: { max_iterations: maxIterations }
    });
  }
}

async function normalizeAgentOutput(
  value: Promise<string | { output: string }> | string | { output: string }
): Promise<string> {
  const resolved = await value;
  return typeof resolved === "string" ? resolved : resolved.output;
}
